import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

import { randomUUID } from 'crypto';

import { PaymentProvider } from './payment.provider';

import { StripeWebhookSignatureInvalidException } from '../exceptions/billing.exceptions';
import type {
  BillingProfile,
  CheckoutSessionSnapshot,
  CreateCheckoutSessionInput,
  CreateCustomerInput,
  CreatePortalSessionInput,
  PaymentMethodSummary,
  PaymentWebhookEvent,
  SubscriptionSnapshot,
  UpdateBillingProfileInput,
} from '../types/billing.type';

/**
 * Stripe's own subscription statuses are a superset of this app's `SubscriptionStatus` — see
 * `0011_billing.sql`'s comment: `trialing`/`incomplete_expired`/`unpaid` are deliberately omitted
 * because nothing in v1 produces them (no trial period). Anything not in this map falls back to
 * `INCOMPLETE` with a warning logged, rather than throwing and dropping the whole webhook.
 */
const STRIPE_STATUS_MAP: Partial<Record<Stripe.Subscription.Status, SubscriptionStatus>> = {
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  incomplete: SubscriptionStatus.INCOMPLETE,
};

/** Real Stripe integration — Checkout Sessions, the Customer Portal, and verified webhooks via the
 *  `stripe` npm SDK. Selected by `PAYMENT_PROVIDER=stripe`; see `billing.module.ts`'s factory. */
@Injectable()
export class StripePaymentProvider extends PaymentProvider {
  readonly type = 'stripe' as const;
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    const secretKey = configService.get<string>('STRIPE_SECRET_KEY') ?? '';
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = configService.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
  }

  /**
   * Idempotency keys guard against exactly the failure mode between our own DB write and Stripe's
   * response that a naive integration misses: if `BillingService.createCheckoutSession` creates
   * this customer successfully but then fails to persist `stripeCustomerId` (a dropped connection,
   * a crash before the `UPDATE` commits), `subscription.stripeCustomerId` is still `null` on the
   * next attempt and this method runs again. Without a key, that's a second, orphaned Stripe
   * customer for the same tenant with no record of it in our own DB. The key is deterministic and
   * tenant-scoped — "this tenant's one customer" — so Stripe itself recognizes the retry and
   * returns the original customer instead of creating another one, for the key's ~24h cache
   * window (a retry any later than that is vanishingly unlikely, and worth a manual fix if it ever
   * happens rather than complicating this call for it).
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
   * A fresh key per call, not a deterministic one keyed on tenant/customer: unlike `createCustomer`,
   * a tenant legitimately starts more than one Checkout Session over time (an abandoned session,
   * a cancel-then-resubscribe) and those must NOT be deduped into the same stale session. This key
   * only protects against the Stripe SDK's own built-in retry-on-network-error retrying this exact
   * call with two different underlying HTTP attempts — it's generated once per invocation and
   * reused across the SDK's internal retries of that one attempt, never across two separate calls.
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

  /** Same reasoning as `createCheckoutSession` — a fresh per-call key only, since a tenant opening
   *  the Customer Portal more than once must get a fresh session each time, not a cached one. */
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
   * Deterministic, keyed on the subscription plus which of the two actions was requested — unlike
   * checkout/portal sessions, this mutates one specific, already-existing Stripe object, so a
   * retry (our webhook handler's DB write failed after Stripe already applied the change, and the
   * caller tries again) must reach the *same* end state rather than erroring a second time
   * (`subscriptions.cancel` 400s on an already-canceled subscription with no idempotency key) or
   * risk any doubled side effect if Stripe ever attaches one to this action in the future.
   */
  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const idempotencyKey = `billing_cancel_${subscriptionId}_${atPeriodEnd ? 'at_period_end' : 'immediate'}`;
    if (atPeriodEnd) {
      await this.stripe.subscriptions.update(
        subscriptionId,
        { cancel_at_period_end: true },
        { idempotencyKey }
      );
    } else {
      await this.stripe.subscriptions.cancel(subscriptionId, {}, { idempotencyKey });
    }
  }

  /**
   * `invoice_settings.default_payment_method` first — what Checkout actually sets as "the" card
   * for a subscription — falling back to the oldest attached card via `paymentMethods.list` for
   * the rare case that field is empty (e.g. a customer created outside Checkout). Returns `null`
   * rather than throwing for a deleted customer or one with no card at all: this is read-only
   * display data, never something a caller should have to guard with a try/catch for.
   */
  async getPaymentMethodSummary(customerId: string): Promise<PaymentMethodSummary | null> {
    const customer = await this.stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (customer.deleted) {
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

  /** Deleted-customer case returns `{ name: null, email: null }` rather than throwing — same
   *  read-only-display reasoning as `getPaymentMethodSummary`. */
  async getBillingProfile(customerId: string): Promise<BillingProfile> {
    const customer = await this.stripe.customers.retrieve(customerId);
    if (customer.deleted) {
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

  /** `usage: 'off_session'` — this card must be chargeable for a future automatic subscription
   *  renewal, not only while the tenant is actively completing this form. A fresh key per call,
   *  same reasoning as `createCheckoutSession`: a tenant retrying a failed card entry must get a
   *  new SetupIntent, not one already consumed by the failed attempt. */
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
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  /**
   * `expand: ['subscription']` is what lets this read the subscription Checkout created in the
   * same round trip, rather than a second call — `session.subscription` comes back as the full
   * object, not just its id, whenever Checkout has actually attached one (i.e. payment completed).
   * `session.metadata.tenantId` is the same metadata `createCheckoutSession` set when minting this
   * session — `BillingReconciliationService` compares it against the caller's own tenant id before
   * trusting anything else in the response.
   */
  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionSnapshot> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    const tenantId = session.metadata?.['tenantId'] ?? null;
    const subscription =
      session.subscription && typeof session.subscription !== 'string'
        ? this.toSubscriptionSnapshot(session.subscription)
        : null;

    return { tenantId, subscription };
  }

  /** `status: 'active'` + `limit: 1` — this app only ever stores one live subscription per tenant
   *  (`idx_tenant_subscriptions_stripe_subscription_id`'s own partial-unique shape), so the newest
   *  active one is the only one worth reading back. */
  async retrieveActiveSubscriptionForCustomer(
    customerId: string
  ): Promise<SubscriptionSnapshot | null> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    const subscription = subscriptions.data[0];
    return subscription ? this.toSubscriptionSnapshot(subscription) : null;
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

  /** The one place a `Stripe.Subscription` becomes this app's own `SubscriptionSnapshot` shape —
   *  shared by `mapEvent`'s `customer.subscription.updated` case, `retrieveCheckoutSession`, and
   *  `retrieveActiveSubscriptionForCustomer`, so all three ways this app ever learns about a
   *  subscription's state agree on exactly which fields matter and how they're derived. */
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
          // Checkout's own webhook payload doesn't carry subscription status/period fields —
          // a freshly completed Checkout session's subscription is always active with no grace
          // period yet, so this can be set directly rather than making a second Stripe API call.
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
