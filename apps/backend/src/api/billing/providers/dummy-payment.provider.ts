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
  NewCheckoutPreparation,
  PaymentMethodSummary,
  PaymentWebhookEvent,
  SubscriptionSnapshot,
  UpdateBillingProfileInput,
} from '../types/billing.type';

/** Fixture card shown for every `dummy_cus_*` customer; Stripe's test `4242` Visa, never a real PAN. */
const DUMMY_PAYMENT_METHOD: PaymentMethodSummary = {
  brand: 'visa',
  last4: '4242',
  expMonth: 12,
  expYear: 2034,
};

/**
 * Simulated provider for running the billing flow without Stripe keys; ids are fabricated.
 *
 * Checkout/portal sessions point at local confirmation pages that call `BillingService` directly,
 * since nothing delivers webhooks for Dummy. So `constructWebhookEvent` is never called and the
 * Stripe-only methods below throw rather than fake a response that would hide a caller bug.
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

  resumeSubscription(subscriptionId: string): Promise<void> {
    this.logger.log(
      `[dev] "Resuming" dummy subscription ${subscriptionId} — no real Stripe object exists.`
    );
    return Promise.resolve();
  }

  voidOpenInvoices(subscriptionId: string): Promise<number> {
    this.logger.log(`[dev] No open invoices to void on dummy subscription ${subscriptionId}.`);
    return Promise.resolve(0);
  }

  deleteCustomer(customerId: string): Promise<void> {
    this.logger.log(
      `[dev] "Deleting" dummy customer ${customerId} — no real Stripe object exists.`
    );
    return Promise.resolve();
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

  // In-app billing management is Stripe-only; `BillingService` guards on `type === 'stripe'`.
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

  // Never reached: Dummy checkout redirects to `DUMMY_CHECKOUT`, and `completeDummyCheckout` replaces this reconciliation.
  retrieveCheckoutSession(_sessionId: string): Promise<CheckoutSessionSnapshot> {
    return Promise.reject(
      new Error(
        "DummyPaymentProvider has no real Checkout Session to retrieve — see this class's own doc comment."
      )
    );
  }

  /** Dummy completes a Checkout synchronously and records it on the row, so `stripe_subscription_id` is already the whole truth. */
  prepareNewCheckout(_customerId: string): Promise<NewCheckoutPreparation> {
    return Promise.resolve({ hasLiveSubscription: false });
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
