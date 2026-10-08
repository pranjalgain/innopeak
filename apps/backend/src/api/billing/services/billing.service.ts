import type { AuthUser } from '@auth/types/auth.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import { BillingReceiptsDbService } from '@db/repositories/billing/billing-receipts.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'crypto';

import { BillingEntitlementsService } from './billing-entitlements.service';
import { BillingReconciliationService } from './billing-reconciliation.service';
import { BillingWebhooksService } from './billing-webhooks.service';

import { BILLING_REDIRECT_PATHS } from '../constants/billing.constants';
import { BillingProfileResponseDto } from '../dto/billing-profile-response.dto';
import { BillingPlansResponseDto } from '../dto/plan-response.dto';
import { ReceiptListResponseDto } from '../dto/receipt-response.dto';
import { RedirectUrlResponseDto } from '../dto/redirect-url-response.dto';
import { SetupIntentResponseDto } from '../dto/setup-intent-response.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import {
  AlreadySubscribedException,
  BillingNotEnabledException,
  DummyProviderNotActiveException,
  PlanNotFoundException,
  ReceiptNotFoundException,
  StripeOnlyFeatureException,
  SubscriptionNotFoundException,
} from '../exceptions/billing.exceptions';
import { PaymentProvider } from '../providers/payment.provider';
import type { UpdateBillingProfileInput } from '../types/billing.type';
import { buildReceiptFilename, renderReceiptPdf } from '../utils/receipt-pdf.util';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly frontendUrl: string;
  /** Deploy-level master switch, read once at construction. */
  private readonly paymentFeatureEnabled: boolean;
  /** Source of truth for the Paid price; `billing_plans.stripe_price_id` is seeded NULL and only a fallback. */
  private readonly stripePriceIdPaid: string | undefined;

  constructor(
    private readonly billingPlansDbService: BillingPlansDbService,
    private readonly tenantSubscriptionsDbService: TenantSubscriptionsDbService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly billingWebhooksService: BillingWebhooksService,
    private readonly billingReconciliationService: BillingReconciliationService,
    private readonly billingReceiptsDbService: BillingReceiptsDbService,
    private readonly authDbService: AuthDbService,
    private readonly paymentProvider: PaymentProvider,
    configService: ConfigService<EnvConfig>
  ) {
    this.frontendUrl = (configService.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
    this.paymentFeatureEnabled = configService.get<string>('PAYMENT_FEATURE_ENABLED') === 'true';
    this.stripePriceIdPaid = configService.get<string>('STRIPE_PRICE_ID_PAID');
  }

  async listPlans(user: AuthUser): Promise<BillingPlansResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const [plans, subscription] = await Promise.all([
      this.billingPlansDbService.listAll(),
      this.tenantSubscriptionsDbService.findByTenantId(tenantUser.tenantId),
    ]);

    if (!subscription) {
      throw new SubscriptionNotFoundException();
    }

    return BillingPlansResponseDto.from(plans, subscription.planId);
  }

  async getSubscription(user: AuthUser): Promise<SubscriptionResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    return this.buildSubscriptionResponse(tenantUser.tenantId);
  }

  /** Reads the Checkout Session from Stripe so a delayed or missed webhook never leaves the tenant unpaid; safe if the webhook already landed. */
  async reconcileCheckoutSession(
    user: AuthUser,
    checkoutSessionId: string
  ): Promise<SubscriptionResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    // A Dummy checkout has no real Checkout Session; reject cleanly rather than 500.
    if (this.paymentProvider.type !== 'stripe') {
      throw new StripeOnlyFeatureException();
    }
    await this.billingReconciliationService.reconcileFromCheckoutSession({
      tenantId: tenantUser.tenantId,
      checkoutSessionId,
    });
    return this.buildSubscriptionResponse(tenantUser.tenantId);
  }

  private async buildSubscriptionResponse(tenantId: string): Promise<SubscriptionResponseDto> {
    const [subscription, entitlements] = await Promise.all([
      this.tenantSubscriptionsDbService.findByTenantId(tenantId),
      this.billingEntitlementsService.getEntitlements(tenantId),
    ]);

    if (!subscription) {
      throw new SubscriptionNotFoundException();
    }

    const paymentMethod = subscription.stripeCustomerId
      ? await this.paymentProvider.getPaymentMethodSummary(subscription.stripeCustomerId)
      : null;

    return SubscriptionResponseDto.from(
      subscription,
      entitlements.planCode,
      entitlements,
      paymentMethod,
      this.paymentProvider.type
    );
  }

  /**
   * Gated on `PAYMENT_FEATURE_ENABLED`; turning it off only blocks new upgrades, never an
   * already-Paid tenant.
   *
   * The read-decide-write span runs in `withCheckoutLock` (per tenant): without it a double-click
   * could mint two Stripe customers and, if both Checkouts completed, two live subscriptions of
   * which only one is recorded and the other auto-renews invisibly forever.
   */
  async createCheckoutSession(user: AuthUser): Promise<RedirectUrlResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);

    if (!this.paymentFeatureEnabled) {
      throw new BillingNotEnabledException();
    }

    const paidPlan = await this.billingPlansDbService.findByCode(BillingPlanCode.PAID);
    if (!paidPlan) {
      throw new PlanNotFoundException();
    }

    const checkout = await this.tenantSubscriptionsDbService.withCheckoutLock(
      tenantUser.tenantId,
      async (tx, subscription) => {
        if (!subscription) {
          throw new SubscriptionNotFoundException();
        }
        if (subscription.stripeSubscriptionId !== null) {
          throw new AlreadySubscribedException();
        }
        if (subscription.stripeCustomerId !== null) {
          // `stripe_subscription_id` stays null until the webhook (or a reconcile) lands, so a completed Checkout is
          // invisible above; Stripe is asked directly, or a Back press from Checkout could buy a second subscription.
          const preparation = await this.paymentProvider.prepareNewCheckout(
            subscription.stripeCustomerId
          );
          return {
            customerId: subscription.stripeCustomerId,
            hasLiveSubscription: preparation.hasLiveSubscription,
          };
        }

        const created = await this.paymentProvider.createCustomer({
          tenantId: tenantUser.tenantId,
          email: tenantUser.email,
        });

        const attached = await this.tenantSubscriptionsDbService.attachStripeCustomerId(
          tenantUser.tenantId,
          created.customerId,
          tx
        );
        // `null` means another write attached a customer id meanwhile (shouldn't happen under the
        // lock); reuse that id rather than proceed on our now-orphaned one.
        if (attached) {
          return { customerId: created.customerId, hasLiveSubscription: false };
        }
        const refreshed = await this.tenantSubscriptionsDbService.findByTenantId(
          tenantUser.tenantId,
          tx
        );
        return {
          customerId: refreshed?.stripeCustomerId ?? created.customerId,
          hasLiveSubscription: false,
        };
      }
    );

    if (checkout.hasLiveSubscription) {
      // Recorded now rather than left for the webhook, so the next read already says Paid.
      await this.billingReconciliationService
        .reconcileTenantSubscription({
          tenantId: tenantUser.tenantId,
          stripeCustomerId: checkout.customerId,
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Could not record the live subscription found for tenant ${tenantUser.tenantId}; the webhook will: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        });
      throw new AlreadySubscribedException();
    }
    const { customerId } = checkout;

    // Stamped before the session exists: if this write failed afterwards, a payment could land on a session the nightly sweep can't see.
    await this.tenantSubscriptionsDbService.touchCheckoutStartedAt(tenantUser.tenantId);

    const session = await this.paymentProvider.createCheckoutSession({
      tenantId: tenantUser.tenantId,
      customerId,
      priceId: this.stripePriceIdPaid ?? paidPlan.stripePriceId ?? '',
      successUrl: `${this.frontendUrl}${BILLING_REDIRECT_PATHS.CHECKOUT_SUCCESS}`,
      cancelUrl: `${this.frontendUrl}${BILLING_REDIRECT_PATHS.CHECKOUT_CANCEL}`,
    });

    return RedirectUrlResponseDto.from(session.url);
  }

  /** Deliberately not gated on `PAYMENT_FEATURE_ENABLED`: an already-Paid tenant keeps Portal access. */
  async createPortalSession(user: AuthUser): Promise<RedirectUrlResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);

    const subscription = await this.tenantSubscriptionsDbService.findByTenantId(
      tenantUser.tenantId
    );
    if (!subscription?.stripeCustomerId) {
      throw new SubscriptionNotFoundException();
    }

    const session = await this.paymentProvider.createPortalSession({
      customerId: subscription.stripeCustomerId,
      returnUrl: `${this.frontendUrl}${BILLING_REDIRECT_PATHS.PORTAL_RETURN}`,
    });

    return RedirectUrlResponseDto.from(session.url);
  }

  async setActiveLocation(user: AuthUser, locationId: string): Promise<void> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    await this.billingEntitlementsService.setActiveLocationForPlan(tenantUser.tenantId, locationId);
  }

  /**
   * Dummy-only: the dummy provider has no webhook caller, so this feeds the handler the same
   * `checkout.session.completed` event Stripe would send. 404s outside `PAYMENT_PROVIDER=dummy`,
   * since a route that flips a tenant to `paid` on the caller's say-so must not exist with real payment.
   */
  async completeDummyCheckout(user: AuthUser, subscriptionId: string): Promise<void> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    if (this.paymentProvider.type !== 'dummy') {
      throw new DummyProviderNotActiveException();
    }

    const subscription = await this.tenantSubscriptionsDbService.findByTenantId(
      tenantUser.tenantId
    );
    if (!subscription?.stripeCustomerId) {
      throw new SubscriptionNotFoundException();
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

    await this.billingWebhooksService.handleEvent({
      id: `dummy_evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      customerId: subscription.stripeCustomerId,
      subscriptionId,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
    });
  }

  /**
   * Always at period end (the tenant keeps what they paid for), and not gated on
   * `PAYMENT_FEATURE_ENABLED`. For Stripe the state change arrives via the
   * `customer.subscription.updated` webhook, not a write here; the dummy provider has no webhook
   * caller, so this applies the equivalent event itself.
   */
  async cancelSubscription(user: AuthUser): Promise<void> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);

    const subscription = await this.tenantSubscriptionsDbService.findByTenantId(
      tenantUser.tenantId
    );
    if (!subscription?.stripeCustomerId || !subscription.stripeSubscriptionId) {
      throw new SubscriptionNotFoundException();
    }

    // Recorded before the provider call (reverted on failure) so cancelling a later erasure can't resume, and charge, an owner's own cancellation.
    await this.tenantSubscriptionsDbService.markCancellationScheduled(
      tenantUser.tenantId,
      SubscriptionCancellationSource.OWNER
    );
    try {
      await this.paymentProvider.cancelSubscription(subscription.stripeSubscriptionId, true);
    } catch (error) {
      await this.tenantSubscriptionsDbService.clearCancellationScheduled(tenantUser.tenantId);
      throw error;
    }

    if (this.paymentProvider.type === 'dummy') {
      await this.billingWebhooksService.handleEvent({
        id: `dummy_evt_${randomUUID()}`,
        type: 'customer.subscription.updated',
        customerId: subscription.stripeCustomerId,
        subscriptionId: subscription.stripeSubscriptionId,
        status: subscription.status ?? SubscriptionStatus.ACTIVE,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: true,
      });
    }
  }

  /** Empty for a tenant who has never made a real Stripe payment (Free, or on Dummy). */
  async listReceipts(user: AuthUser): Promise<ReceiptListResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const receipts = await this.billingReceiptsDbService.listByTenantId(tenantUser.tenantId);
    return ReceiptListResponseDto.from(receipts);
  }

  /**
   * Rendered on demand, never stored. Tenant scoping is in the query itself, so a missing receipt
   * and someone else's are indistinguishable (`ReceiptNotFoundException`).
   */
  async downloadReceiptPdf(
    user: AuthUser,
    receiptId: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);

    const receipt = await this.billingReceiptsDbService.findByIdForTenant(
      receiptId,
      tenantUser.tenantId
    );
    if (!receipt) {
      throw new ReceiptNotFoundException();
    }

    const tenant = await this.authDbService.findTenantStatus(tenantUser.tenantId);

    const buffer = await renderReceiptPdf({
      businessName: tenant?.name ?? tenantUser.email,
      billedToEmail: tenantUser.email,
      invoiceNumber: receipt.invoiceNumber,
      stripeInvoiceId: receipt.stripeInvoiceId,
      paidAt: receipt.paidAt,
      amountPaid: receipt.amountPaid,
      currency: receipt.currency,
      // Only one paid product exists, so no per-receipt lookup. Not localized, like the rest of the PDF template.
      planDescription: 'InnoPeak Paid Plan — Monthly Subscription',
    });

    return { buffer, filename: buildReceiptFilename(receipt) };
  }

  /** Stripe-only: a `dummy_cus_*` id has no real Stripe object to edit, so this throws rather than fake one. Needs an existing customer. */
  private async requireStripeCustomerId(tenantId: string): Promise<string> {
    if (this.paymentProvider.type !== 'stripe') {
      throw new StripeOnlyFeatureException();
    }

    const subscription = await this.tenantSubscriptionsDbService.findByTenantId(tenantId);
    if (!subscription?.stripeCustomerId) {
      throw new SubscriptionNotFoundException();
    }
    return subscription.stripeCustomerId;
  }

  async getBillingProfile(user: AuthUser): Promise<BillingProfileResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const customerId = await this.requireStripeCustomerId(tenantUser.tenantId);
    const profile = await this.paymentProvider.getBillingProfile(customerId);
    return BillingProfileResponseDto.from(profile);
  }

  async updateBillingProfile(
    user: AuthUser,
    input: UpdateBillingProfileInput
  ): Promise<BillingProfileResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const customerId = await this.requireStripeCustomerId(tenantUser.tenantId);
    const profile = await this.paymentProvider.updateBillingProfile(customerId, input);
    return BillingProfileResponseDto.from(profile);
  }

  async createSetupIntent(user: AuthUser): Promise<SetupIntentResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const customerId = await this.requireStripeCustomerId(tenantUser.tenantId);
    const { clientSecret } = await this.paymentProvider.createSetupIntent(customerId);
    return SetupIntentResponseDto.from(clientSecret);
  }

  /** Called once the browser has confirmed the SetupIntent. */
  async setDefaultPaymentMethod(user: AuthUser, paymentMethodId: string): Promise<void> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const customerId = await this.requireStripeCustomerId(tenantUser.tenantId);
    await this.paymentProvider.setDefaultPaymentMethod(customerId, paymentMethodId);
  }
}
