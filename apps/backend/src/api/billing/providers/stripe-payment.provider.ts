import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { randomUUID } from 'crypto';

import { PaymentProvider } from './payment.provider';

import {
  CheckoutSessionTenantMismatchException,
  PaymentMethodNotUsableException,
  PaymentNotConfiguredException,
  StripeWebhookSignatureInvalidException,
} from '../exceptions/billing.exceptions';
import type {
  BillingProfile,
  CheckoutSessionSnapshot,
  CreateCheckoutSessionInput,
  CreateCustomerInput,
  CreatePortalSessionInput,
  NewCheckoutPreparation,
  PaymentMethodSummary,
  PaymentWebhookEvent,
  SubscriptionSnapshot,
  UpdateBillingProfileInput,
} from '../types/billing.type';
import { isResourceMissing } from '../utils/stripe-error.util';

/**
 * `trialing`/`incomplete_expired`/`unpaid` are deliberately omitted: nothing produces them (no
 * trial). Unmapped statuses fall back to `INCOMPLETE` with a warning rather than dropping the webhook.
 */
const STRIPE_STATUS_MAP: Partial<Record<Stripe.Subscription.Status, SubscriptionStatus>> = {
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  incomplete: SubscriptionStatus.INCOMPLETE,
};

const LIVE_SUBSCRIPTION_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
]);

@Injectable()
export class StripePaymentProvider extends PaymentProvider {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private client: Stripe | null = null;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.secretKey = configService.get<string>('STRIPE_SECRET_KEY') ?? '';
    this.webhookSecret = configService.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
  }

  /** Built on first use: Stripe's SDK throws on an empty key, which would otherwise stop the app booting without one. */
  private get stripe(): Stripe {
    if (this.client === null) {
      if (this.secretKey === '') {
        throw new PaymentNotConfiguredException();
      }
      this.client = new Stripe(this.secretKey);
    }
    return this.client;
  }

  /**
   * Deterministic, tenant-scoped idempotency key: if the customer is created but persisting
   * `stripeCustomerId` fails, the retry would otherwise create a second, orphaned Stripe customer.
   * Stripe only replays the key for ~24h; a later retry is unlikely enough to fix manually.
   */
  async createCustomer(input: CreateCustomerInput): Promise<{ customerId: string }> {
    const customer = await this.stripe.customers.create(
      {
        email: input.email,
        metadata: { tenantId: input.tenantId },
      },
      { idempotencyKey: `billing_customer_${input.tenantId}` }
    );
    return { customerId: customer.id };
  }

  /**
   * Fresh key per call, unlike `createCustomer`: a tenant legitimately starts several Checkout
   * Sessions over time (abandoned, resubscribe) that must not be deduped into a stale one. It only
   * covers the SDK's own network retries of one call.
   */
  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: input.customerId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata: { tenantId: input.tenantId },
      },
      { idempotencyKey: randomUUID() }
    );

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout Session URL');
    }
    return { url: session.url };
  }

  // Fresh key per call, as in `createCheckoutSession`: each portal open needs a new session.
  async createPortalSession(input: CreatePortalSessionInput): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create(
      {
        customer: input.customerId,
        return_url: input.returnUrl,
      },
      { idempotencyKey: randomUUID() }
    );
    return { url: session.url };
  }

  /**
   * Immediate cancel uses a deterministic key: `subscriptions.cancel` 400s on an already-cancelled
   * subscription, so a retry must replay the first result.
   *
   * At-period-end is naturally idempotent and gets a fresh key: Stripe replays a key for 24h, so
   * cancel, resume, cancel again within a day would skip the second cancel and leave it renewing.
   */
  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    if (atPeriodEnd) {
      await this.stripe.subscriptions.update(
        subscriptionId,
        { cancel_at_period_end: true },
        { idempotencyKey: randomUUID() }
      );
    } else {
      await this.stripe.subscriptions.cancel(
        subscriptionId,
        {},
        { idempotencyKey: `billing_cancel_${subscriptionId}_immediate` }
      );
    }
  }

  // Fresh key per call, like the at-period-end cancel: resume, cancel, resume within a day must each apply.
  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: false },
      { idempotencyKey: randomUUID() }
    );
  }

  async voidOpenInvoices(subscriptionId: string): Promise<number> {
    const open = await this.stripe.invoices.list({ subscription: subscriptionId, status: 'open' });
    for (const invoice of open.data) {
      if (invoice.id) {
        await this.stripe.invoices.voidInvoice(invoice.id);
      }
    }
    return open.data.length;
  }

  async deleteCustomer(customerId: string): Promise<void> {
    try {
      await this.stripe.customers.del(customerId);
    } catch (error) {
      // Already deleted (or never existed on this account): the goal state is reached.
      if ((error as { code?: unknown }).code === 'resource_missing') {
        return;
      }
      throw error;
    }
  }

  /**
   * Prefers `invoice_settings.default_payment_method` (what Checkout sets), falling back to the
   * first attached card. Returns `null` rather than throwing: this is read-only display data.
   */
  async getPaymentMethodSummary(customerId: string): Promise<PaymentMethodSummary | null> {
    const customer = await this.retrieveCustomer(customerId, [
      'invoice_settings.default_payment_method',
    ]);
    if (customer === null || customer.deleted) {
      return null;
    }

    const defaultMethod = customer.invoice_settings.default_payment_method;
    if (defaultMethod && typeof defaultMethod !== 'string' && defaultMethod.card) {
      return this.toPaymentMethodSummary(defaultMethod.card);
    }

    const methods = await this.stripe.paymentMethods.list({ customer: customerId, type: 'card' });
    const firstCard = methods.data[0]?.card;
    return firstCard ? this.toPaymentMethodSummary(firstCard) : null;
  }

  // A deleted or unknown customer yields nulls rather than throwing (read-only display).
  async getBillingProfile(customerId: string): Promise<BillingProfile> {
    const customer = await this.retrieveCustomer(customerId);
    if (customer === null || customer.deleted) {
      return { name: null, email: null };
    }
    return { name: customer.name ?? null, email: customer.email ?? null };
  }

  async updateBillingProfile(
    customerId: string,
    input: UpdateBillingProfileInput
  ): Promise<BillingProfile> {
    const customer = await this.stripe.customers.update(customerId, {
      name: input.name,
      email: input.email,
    });
    return { name: customer.name ?? null, email: customer.email ?? null };
  }

  /** `off_session`: the card must be chargeable for future renewals. Fresh key per call so a retry gets a new SetupIntent, not a consumed one. */
  async createSetupIntent(customerId: string): Promise<{ clientSecret: string }> {
    const setupIntent = await this.stripe.setupIntents.create(
      { customer: customerId, payment_method_types: ['card'], usage: 'off_session' },
      { idempotencyKey: randomUUID() }
    );

    if (!setupIntent.client_secret) {
      throw new Error('Stripe did not return a SetupIntent client secret');
    }
    return { clientSecret: setupIntent.client_secret };
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    try {
      await this.stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    } catch (error) {
      // A nonexistent id, or one not belonging to this customer, is the caller's mistake (or a probe).
      if ((error as { type?: unknown }).type === 'StripeInvalidRequestError') {
        throw new PaymentMethodNotUsableException();
      }
      throw error;
    }
  }

  /**
   * `expand: ['subscription']` returns the full subscription (once payment completed) in one round
   * trip. `metadata.tenantId` lets `BillingReconciliationService` verify ownership before trusting the rest.
   */
  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot> {
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription'],
      });
    } catch (error) {
      // The id is client input: an unknown one must look like another tenant's session (404), not a
      // 500 echoing Stripe's "No such checkout.session" text.
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 'resource_missing'
      ) {
        throw new CheckoutSessionTenantMismatchException();
      }
      throw error;
    }

    const tenantId = session.metadata?.['tenantId'] ?? null;
    const subscription =
      session.subscription && typeof session.subscription !== 'string'
        ? this.toSubscriptionSnapshot(session.subscription)
        : null;

    return { tenantId, subscription };
  }

  // `limit: 1`: only one live subscription is stored per tenant.
  async prepareNewCheckout(customerId: string): Promise<NewCheckoutPreparation> {
    // Wider than `active`: a past-due or incomplete (e.g. awaiting 3-D Secure) subscription is still one a second Checkout would duplicate.
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    if (
      subscriptions.data.some(subscription => LIVE_SUBSCRIPTION_STATUSES.has(subscription.status))
    ) {
      return { hasLiveSubscription: true };
    }

    const open = await this.stripe.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 100,
    });
    await Promise.all(open.data.map(session => this.stripe.checkout.sessions.expire(session.id)));
    return { hasLiveSubscription: false };
  }

  async retrieveActiveSubscriptionForCustomer(
    customerId: string
  ): Promise<SubscriptionSnapshot | null> {
    let subscriptions: Stripe.ApiList<Stripe.Subscription>;
    try {
      subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 1,
      });
    } catch (error) {
      // A customer Stripe doesn't know has no subscription; answering null lets the sweep stamp it verified instead of failing it every night.
      if (isResourceMissing(error)) {
        return null;
      }
      throw error;
    }

    const subscription = subscriptions.data[0];
    return subscription ? this.toSubscriptionSnapshot(subscription) : null;
  }

  /** `null` when Stripe has no such customer, e.g. an id written before Stripe was the only provider. */
  private async retrieveCustomer(
    customerId: string,
    expand?: string[]
  ): Promise<Stripe.Customer | Stripe.DeletedCustomer | null> {
    try {
      return expand
        ? await this.stripe.customers.retrieve(customerId, { expand })
        : await this.stripe.customers.retrieve(customerId);
    } catch (error) {
      if (isResourceMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  private toPaymentMethodSummary(card: Stripe.PaymentMethod.Card): PaymentMethodSummary {
    return {
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
    };
  }

  constructWebhookEvent(payload: Buffer, signature: string): PaymentWebhookEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      this.logger.warn(`Stripe webhook signature verification failed: ${(error as Error).message}`);
      throw new StripeWebhookSignatureInvalidException();
    }

    return { ...this.mapEvent(event), createdAt: new Date(event.created * 1000).toISOString() };
  }

  private mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
    const mapped = STRIPE_STATUS_MAP[status];
    if (mapped) {
      return mapped;
    }
    this.logger.warn(
      `Unmapped Stripe subscription status "${status}" — falling back to INCOMPLETE. Add it to ` +
        "STRIPE_STATUS_MAP (and this app's subscription_status enum) once a real code path produces it."
    );
    return SubscriptionStatus.INCOMPLETE;
  }

  private toIsoOrNull(unixSeconds: number | null | undefined): string | null {
    return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
  }

  /** Shared by the webhook, checkout and reconciliation paths so they derive state identically. */
  private toSubscriptionSnapshot(subscription: Stripe.Subscription): SubscriptionSnapshot {
    return {
      stripeSubscriptionId: subscription.id,
      status: this.mapStatus(subscription.status),
      currentPeriodStart: this.toIsoOrNull(subscription.items.data[0]?.current_period_start),
      currentPeriodEnd: this.toIsoOrNull(subscription.items.data[0]?.current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  private mapEvent(event: Stripe.Event): PaymentWebhookEvent {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = typeof session.customer === 'string' ? session.customer : '';
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : '';
        return {
          id: event.id,
          type: 'checkout.session.completed',
          customerId,
          subscriptionId,
          // The payload carries no status/period fields; a just-completed Checkout subscription is
          // always active, so no second API call is needed.
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: null,
          currentPeriodEnd: null,
        };
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : '';
        const snapshot = this.toSubscriptionSnapshot(subscription);
        return {
          id: event.id,
          type: 'customer.subscription.updated',
          customerId,
          subscriptionId: snapshot.stripeSubscriptionId,
          status: snapshot.status,
          currentPeriodStart: snapshot.currentPeriodStart,
          currentPeriodEnd: snapshot.currentPeriodEnd,
          cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
        };
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : '';
        return {
          id: event.id,
          type: 'customer.subscription.deleted',
          customerId,
          subscriptionId: subscription.id,
        };
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : '';
        return { id: event.id, type: 'invoice.payment_failed', customerId };
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : '';
        const subscriptionRef = invoice.parent?.subscription_details?.subscription;
        const subscriptionId = typeof subscriptionRef === 'string' ? subscriptionRef : null;
        return {
          id: event.id,
          type: 'invoice.payment_succeeded',
          customerId,
          invoiceId: invoice.id,
          subscriptionId,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          invoiceNumber: invoice.number ?? null,
          paidAt:
            this.toIsoOrNull(invoice.status_transitions.paid_at) ??
            this.toIsoOrNull(invoice.created) ??
            new Date().toISOString(),
        };
      }
      default:
        return { id: event.id, type: 'unhandled', rawType: event.type };
    }
  }
}
