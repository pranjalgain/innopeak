import { Module } from '@nestjs/common';

import { PaymentProvider } from './providers/payment.provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';
import { BillingReconciliationService } from './services/billing-reconciliation.service';

// Stripe only: there is no offline stand-in. Stripe's client is created on first use, so an install without keys boots and
// the billing routes that need Stripe answer 503.
export const paymentProviderBinding = { provide: PaymentProvider, useClass: StripePaymentProvider };

/**
 * Split out of `BillingModule` so the worker (`CronModule`) can reach `BillingReconciliationService`
 * without instantiating the controllers and webhook handler. `BillingModule` imports this too, so
 * there is one `PaymentProvider` per process.
 */
@Module({
  providers: [paymentProviderBinding, BillingReconciliationService],
  exports: [PaymentProvider, BillingReconciliationService],
})
export class BillingReconciliationModule {}
