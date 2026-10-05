import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'crypto';

import { PaymentProvider } from './payment.provider';

import { BILLING_REDIRECT_PATHS } from '../constants/billing.constants';
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

/** A fixed fixture card — every `dummy_cus_*` "customer" shows the same one, since there is no
 *  real card to fetch. Test-network digits (Stripe's own `4242` Visa), never a real PAN. */
const DUMMY_PAYMENT_METHOD: PaymentMethodSummary = {
  brand: 'visa',
  last4: '4242',
  expMonth: 12,
  expYear: 2034,
};

/**
 * The default `PaymentProvider` — a no-op/simulated backend so the whole upgrade/manage/cancel
 * flow can be exercised end-to-end with zero real Stripe keys, the same role
 * `NoopStorageProvider`/`NoopEmailProvider` play for their own features. Every id it mints is
 * fabricated (`dummy_cus_*`/`dummy_sub_*`) and never touches a real payment network.
 *
 * `createCheckoutSession`/`createPortalSession` point at local confirmation routes
 * (`DummyCheckoutPage`/`DummyPortalPage`) instead of a real Stripe redirect — they read the
 * `tenantId`/`customerId`/`subscriptionId` query params the URL carries and call the relevant
 * `BillingService` method directly (`completeDummyCheckout`, or — same as the Settings page's own
 * "Cancel subscription" button now uses for every provider — `cancelSubscription`), since there is
 * no external webhook caller for Dummy to deliver one on its own. `cancelSubscription` applies the
 * `customer.subscription.updated`-equivalent (`cancelAtPeriodEnd: true`) state change itself for
 * this provider. `constructWebhookEvent` is therefore never called on this provider and throws if
 * it somehow is.
 */
@Injectable()
export class DummyPaymentProvider extends PaymentProvider {
  readonly type = 'dummy' as const;
  private readonly logger = new Logger(DummyPaymentProvider.name);
  private readonly frontendUrl: string;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.frontendUrl = (configService.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
  }

  createCustomer(input: CreateCustomerInput): Promise<{ customerId: string }> {
    const customerId = `dummy_cus_${randomUUID()}`;
    this.logger.log(
      `[dev] Created dummy Stripe customer ${customerId} for tenant ${input.tenantId} (${input.email}).`
    );
    return Promise.resolve({ customerId });
  }

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ url: string }> {
    const subscriptionId = `dummy_sub_${randomUUID()}`;
    const url = this.buildConfirmationUrl(BILLING_REDIRECT_PATHS.DUMMY_CHECKOUT, {
      tenantId: input.tenantId,
      customerId: input.customerId,
      subscriptionId,
    });
    this.logger.log(`[dev] Dummy checkout session for tenant ${input.tenantId}: ${url}`);
    return Promise.resolve({ url });
  }

  createPortalSession(input: CreatePortalSessionInput): Promise<{ url: string }> {
    const url = this.buildConfirmationUrl(BILLING_REDIRECT_PATHS.DUMMY_PORTAL, {
      customerId: input.customerId,
    });
    this.logger.log(`[dev] Dummy portal session for customer ${input.customerId}: ${url}`);
    return Promise.resolve({ url });
  }

  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    this.logger.log(
      `[dev] "Canceling" dummy subscription ${subscriptionId} (atPeriodEnd=${atPeriodEnd}) — ` +
        'no real Stripe object exists. The caller applies the resulting state change itself.'
    );
    return Promise.resolve();
  }

  getPaymentMethodSummary(_customerId: string): Promise<PaymentMethodSummary | null> {
    return Promise.resolve(DUMMY_PAYMENT_METHOD);
  }

  /**
   * In-app "manage billing" (profile edit + card update via Stripe Elements/SetupIntent) is
   * Stripe-only — `BillingService` guards on `paymentProvider.type === 'stripe'` before ever
   * reaching these, so none of the four methods below should execute in practice. They throw
   * rather than fake a working response: a `dummy_cus_*` id has no real Stripe Customer object
   * behind it, so there is nothing genuine to read a profile from or attach a real card to — unlike
   * `getPaymentMethodSummary`'s fixture above, faking this would silently hide a real caller bug.
   */
  getBillingProfile(_customerId: string): Promise<BillingProfile> {
    return Promise.reject(
      new Error(
        "DummyPaymentProvider has no real Stripe customer to read a billing profile from — see this class's own doc comment."
      )
    );
  }

  updateBillingProfile(
    _customerId: string,
    _input: UpdateBillingProfileInput
  ): Promise<BillingProfile> {
    return Promise.reject(
      new Error(
        "DummyPaymentProvider has no real Stripe customer to update a billing profile on — see this class's own doc comment."
      )
    );
  }

  createSetupIntent(_customerId: string): Promise<{ clientSecret: string }> {
    return Promise.reject(
      new Error(
        "DummyPaymentProvider has no real Stripe customer to create a SetupIntent for — see this class's own doc comment."
      )
    );
  }

  setDefaultPaymentMethod(_customerId: string, _paymentMethodId: string): Promise<void> {
    return Promise.reject(
      new Error(
        "DummyPaymentProvider has no real Stripe customer to attach a payment method to — see this class's own doc comment."
      )
    );
  }

  constructWebhookEvent(_payload: Buffer, _signature: string): PaymentWebhookEvent {
    throw new Error(
      "DummyPaymentProvider has no external webhook caller — see this class's own doc comment."
    );
  }

  /** Same "no real Stripe object to read" reasoning as `getBillingProfile` et al. above — Dummy's
   *  checkout flow redirects to `DUMMY_CHECKOUT`, never `success_url`, so this is never actually
   *  reached in practice; `completeDummyCheckout` is Dummy's own equivalent of this reconciliation
   *  path, driven by the query params its own confirmation page already carries. */
  retrieveCheckoutSession(_sessionId: string): Promise<CheckoutSessionSnapshot> {
    return Promise.reject(
      new Error(
        "DummyPaymentProvider has no real Checkout Session to retrieve — see this class's own doc comment."
      )
    );
  }

  retrieveActiveSubscriptionForCustomer(_customerId: string): Promise<SubscriptionSnapshot | null> {
    return Promise.reject(
      new Error(
        "DummyPaymentProvider has no real Stripe subscription to retrieve — see this class's own doc comment."
      )
    );
  }

  private buildConfirmationUrl(path: string, params: Record<string, string>): string {
    const query = new URLSearchParams(params).toString();
    return `${this.frontendUrl}${path}?${query}`;
  }
}
