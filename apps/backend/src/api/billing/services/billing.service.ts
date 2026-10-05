import type { AuthUser } from '@auth/types/auth.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import { BillingReceiptsDbService } from '@db/repositories/billing/billing-receipts.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { Injectable } from '@nestjs/common';
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

/**
 * Plans listing, current subscription, and Checkout/Customer-Portal session orchestration — the
 * tenant-facing half of the module (`BillingWebhooksService` owns the Stripe-facing half).
 */
@Injectable()
export class BillingService {
  private readonly frontendUrl: string;
  /** Deploy-level master switch — see `PAYMENT_FEATURE_ENABLED`'s own doc comment in
   *  `env.config.ts`. Read once at construction: a deploy-time value, not something that changes
   *  while the process is running. */
  private readonly paymentFeatureEnabled: boolean;
  /** The Paid plan's real Stripe Price id — see `STRIPE_PRICE_ID_PAID`'s own doc comment in
   *  `env.config.ts`. Read here, not from `billing_plans.stripe_price_id` (seeded `NULL` and
   *  never written by anything): this env var is the actual source of truth, falling back to that
   *  DB column only for an operator who prefers to set it there instead. */
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

  /**
   * `POST /v1/billing/checkout/reconcile` — the checkout-redirect reconciliation path (Layer 2 of
   * the webhook-miss recovery design, see `BillingReconciliationService`'s own doc comment). Reads
   * the Checkout Session straight from Stripe instead of waiting on `checkout.session.completed`,
   * so a tenant who lands on the success page is never stuck reading as unpaid just because that
   * webhook was delayed or never arrived — safe to call even when the webhook already landed first
   * (`setToPaidFromCheckout` is a plain idempotent `UPDATE`).
   */
  async reconcileCheckoutSession(
    user: AuthUser,
    checkoutSessionId: string
  ): Promise<SubscriptionResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    // A Dummy checkout never redirects to Stripe's success_url, so there is no real Checkout
    // Session to read — reject cleanly rather than letting the provider's plain Error surface as 500.
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

    // No customer yet (never started a checkout) — nothing to fetch a card for.
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
   * The upgrade entry point — gated on `PAYMENT_FEATURE_ENABLED` (deploy-level; see
   * `env.config.ts`'s own doc comment for why this is the *only* switch, not one of two). Turning
   * it off never touches an already-subscribed tenant (nothing here un-upgrades a tenant already
   * on the Paid plan) — this only blocks *new* upgrades from starting here.
   *
   * The read-decide-(create customer)-write span runs inside `withCheckoutLock`, serialized per
   * tenant — without it, a double-click or two open tabs could both read no existing Stripe
   * subscription/customer, each mint its own Stripe customer and Checkout Session, and (if both
   * were completed) leave the tenant with two separately-billed live subscriptions, only one of
   * which `tenant_subscriptions` would ever record — the other invisible to `cancelSubscription`
   * and auto-renewing forever. `AlreadySubscribedException` closes the same race's simpler half:
   * a tenant who already has a live `stripeSubscriptionId` gets a 409 instead of a second Checkout
   * Session, whether or not two requests actually overlapped in time.
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

    const customerId = await this.tenantSubscriptionsDbService.withCheckoutLock(
      tenantUser.tenantId,
      async (tx, subscription) => {
        if (!subscription) {
          throw new SubscriptionNotFoundException();
        }
        if (subscription.stripeSubscriptionId !== null) {
          throw new AlreadySubscribedException();
        }
        if (subscription.stripeCustomerId !== null) {
          return subscription.stripeCustomerId;
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
        // `attached` is only ever `null` if some other write attached a customer id between the
        // read above and here — shouldn't happen while `withCheckoutLock` holds the per-tenant
        // lock, but re-reading and reusing that id (rather than proceeding on our own, now-
        // orphaned one) keeps this correct even if that assumption ever stops holding.
        if (attached) {
          return created.customerId;
        }
        const refreshed = await this.tenantSubscriptionsDbService.findByTenantId(
          tenantUser.tenantId,
          tx
        );
        return refreshed?.stripeCustomerId ?? created.customerId;
      }
    );

    // Stamped before the session exists, not after: if this write failed afterwards, a payment
    // could land on a session the nightly reconciliation sweep is blind to. See
    // `0011_billing.sql`'s `checkout_started_at` comment.
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

  /** Manage/cancel an existing subscription — deliberately NOT gated on `PAYMENT_FEATURE_ENABLED`:
   *  an already-Paid tenant keeps full Customer Portal access regardless of the deploy-level
   *  switch, the same "never retroactive" reasoning `createCheckoutSession`'s own doc comment
   *  describes. */
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

  /** Thin pass-through that narrows `user` before handing off to
   *  `BillingEntitlementsService.setActiveLocationForPlan` — kept here (rather than injecting
   *  `BillingEntitlementsService` into the controller too) so the controller calls exactly one
   *  service method per module-structure.md. */
  async setActiveLocation(user: AuthUser, locationId: string): Promise<void> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    await this.billingEntitlementsService.setActiveLocationForPlan(tenantUser.tenantId, locationId);
  }

  /**
   * Dummy-only: lets the `/billing/dummy-checkout` confirmation page complete the upgrade itself,
   * since `DummyPaymentProvider` has no external webhook caller to do it automatically (its own
   * `constructWebhookEvent` throws — see that class's doc comment). Builds the exact same
   * `checkout.session.completed` `PaymentWebhookEvent` shape a real Stripe delivery would, and
   * hands it to `BillingWebhooksService.handleEvent` — the state transition itself is identical
   * either way, only how the event gets here differs. 404s outside `PAYMENT_PROVIDER=dummy`: a
   * route that flips any tenant to `paid` on nothing but the caller's own say-so must not exist
   * once real payment is behind it.
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
   * The tenant's own in-app cancel action — calls the payment provider directly instead of
   * redirecting to a hosted portal, since canceling needs none of the PCI-scoped UI that updating
   * a card would (see `createPortalSession`, kept separate and still portal-based for that).
   *
   * Always at-period-end: the tenant keeps what they already paid for, the same "never
   * retroactive" framing `createCheckoutSession`'s own doc comment uses, and the exact state a
   * real Stripe Customer Portal cancel leaves a subscription in. Not gated on
   * `PAYMENT_FEATURE_ENABLED`, same reasoning as `createPortalSession`.
   *
   * This method never writes `tenant_subscriptions` itself for the real provider — Stripe's own
   * `customer.subscription.updated` webhook (fired by the `cancel_at_period_end: true` update
   * `paymentProvider.cancelSubscription` makes) is what `BillingWebhooksService` actually applies
   * the state change from, arriving asynchronously just like a Customer-Portal-initiated cancel
   * would. `DummyPaymentProvider` has no real webhook caller (see its own doc comment), so for it
   * this method applies the equivalent state change itself — replacing the old dummy-only
   * `cancelDummySubscription`/`dummy/cancel-subscription` endpoint this consolidates; the frontend
   * now calls this same method regardless of which provider is active.
   */
  async cancelSubscription(user: AuthUser): Promise<void> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);

    const subscription = await this.tenantSubscriptionsDbService.findByTenantId(
      tenantUser.tenantId
    );
    if (!subscription?.stripeCustomerId || !subscription.stripeSubscriptionId) {
      throw new SubscriptionNotFoundException();
    }

    await this.paymentProvider.cancelSubscription(subscription.stripeSubscriptionId, true);

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

  /** `billing_receipts` history for Settings → Billing — empty for a tenant who has never made a
   *  real Stripe payment (Free, or on Dummy). See `0012_billing_receipts.sql`'s own doc comment. */
  async listReceipts(user: AuthUser): Promise<ReceiptListResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const receipts = await this.billingReceiptsDbService.listByTenantId(tenantUser.tenantId);
    return ReceiptListResponseDto.from(receipts);
  }

  /**
   * Renders a PDF for one past payment on demand (not stored — cheap enough to regenerate every
   * request, and avoids ever having a stale copy of a receipt sitting in a bucket). Scoped to the
   * caller's own tenant at the query itself (`findByIdForTenant`), not by fetching-then-comparing
   * `tenantId` in this method — so "doesn't exist" and "someone else's receipt" collapse to the
   * same `ReceiptNotFoundException` (no leak) even if a future call site here forgot to compare.
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
      // The only line item there is: `billing_plans` has exactly one paid product today (see
      // `BillingPlanCode`), so this is a plain description rather than something looked up per
      // receipt. Not run through the i18n message catalog, matching the rest of this PDF's own
      // template text (labels, footer) — the receipt itself isn't localized yet.
      planDescription: 'InnoPeak Paid Plan — Monthly Subscription',
    });

    return { buffer, filename: buildReceiptFilename(receipt) };
  }

  /**
   * In-app "manage billing" — reads/writes the Stripe Customer directly instead of redirecting to
   * the hosted Customer Portal. Stripe-only, unlike `createPortalSession`/`cancelSubscription`:
   * those two already had a real Dummy equivalent (a confirmation page, a state-machine update)
   * to fall back to, but there is no meaningful "edit billing profile" or "add a card" for a
   * `dummy_cus_*` id with no real Stripe object behind it — so this throws `StripeOnlyFeatureException`
   * instead of faking one. Requires an existing customer (same as `createPortalSession`): the tenant
   * must have started at least one checkout before there's a Stripe Customer to edit.
   */
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

  /** Starts the Stripe Elements card-collection flow — see `PaymentProvider.createSetupIntent`'s
   *  own doc comment for why only a `clientSecret` crosses this boundary. */
  async createSetupIntent(user: AuthUser): Promise<SetupIntentResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const customerId = await this.requireStripeCustomerId(tenantUser.tenantId);
    const { clientSecret } = await this.paymentProvider.createSetupIntent(customerId);
    return SetupIntentResponseDto.from(clientSecret);
  }

  /** Called once the browser has confirmed the SetupIntent, so the new card actually becomes the
   *  one `getSubscription`'s masked-card display (and any future renewal) uses. */
  async setDefaultPaymentMethod(user: AuthUser, paymentMethodId: string): Promise<void> {
    const tenantUser = requireTenantUser(user, MESSAGES.BILLING.TENANT_ONLY);
    const customerId = await this.requireStripeCustomerId(tenantUser.tenantId);
    await this.paymentProvider.setDefaultPaymentMethod(customerId, paymentMethodId);
  }
}
