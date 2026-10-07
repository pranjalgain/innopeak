import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

/** `PAYMENT_FEATURE_ENABLED` is off; gates checkout only, never existing access. */
export class BillingNotEnabledException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.NOT_ENABLED) {
    super({ message, code: 'BILLING_NOT_ENABLED' });
  }
}

export class PlanNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.PLAN_NOT_FOUND) {
    super({ message, code: 'PLAN_NOT_FOUND' });
  }
}

/** Should never fire: every tenant gets a `free` subscription row in its creation transaction. */
export class SubscriptionNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.SUBSCRIPTION_NOT_FOUND) {
    super({ message, code: 'SUBSCRIPTION_NOT_FOUND' });
  }
}

/** Guards against a double-click/two-tab race minting two billed subscriptions with only one id recorded. */
export class AlreadySubscribedException extends ConflictException {
  constructor(message: string = MESSAGES.BILLING.ALREADY_SUBSCRIBED) {
    super({ message, code: 'ALREADY_SUBSCRIBED' });
  }
}

export class LocationLimitReachedException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.LOCATION_LIMIT_REACHED) {
    super({ message, code: 'LOCATION_LIMIT_REACHED' });
  }
}

export class TeamMemberLimitReachedException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.TEAM_MEMBER_LIMIT_REACHED) {
    super({ message, code: 'TEAM_MEMBER_LIMIT_REACHED' });
  }
}

export class CustomPromptsNotOnPlanException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.CUSTOM_PROMPTS_NOT_ON_PLAN) {
    super({ message, code: 'CUSTOM_PROMPTS_NOT_ON_PLAN' });
  }
}

export class AiDraftLimitReachedException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.AI_DRAFT_LIMIT_REACHED) {
    super({ message, code: 'AI_DRAFT_LIMIT_REACHED' });
  }
}

/** The webhook route is `@Public()`, so the signature check is its entire trust boundary. */
export class StripeWebhookSignatureInvalidException extends BadRequestException {
  constructor(message: string = MESSAGES.BILLING.STRIPE_WEBHOOK_SIGNATURE_INVALID) {
    super({ message, code: 'STRIPE_WEBHOOK_SIGNATURE_INVALID' });
  }
}

/** Location is not this tenant's, or is `inactive` (disconnected). */
export class LocationNotEligibleForActivationException extends BadRequestException {
  constructor(message: string = MESSAGES.BILLING.LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION) {
    super({ message, code: 'LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION' });
  }
}

/** `DummyPaymentProvider` has no real Stripe Customer to read or edit. */
export class StripeOnlyFeatureException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.STRIPE_ONLY_FEATURE) {
    super({ message, code: 'STRIPE_ONLY_FEATURE' });
  }
}

/** Missing and other-tenant receipts are deliberately indistinguishable. */
export class ReceiptNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.RECEIPT_NOT_FOUND) {
    super({ message, code: 'RECEIPT_NOT_FOUND' });
  }
}

/** Dummy routes would be a free-upgrade path, so they must be unreachable under `PAYMENT_PROVIDER=stripe`. */
export class DummyProviderNotActiveException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.DUMMY_PROVIDER_NOT_ACTIVE) {
    super({ message, code: 'DUMMY_PROVIDER_NOT_ACTIVE' });
  }
}

/** Thrown, not swallowed, so it rolls back the `stripe_webhook_events` ledger insert and the non-2xx makes Stripe retry (the miss may be a still-committing checkout or replication lag). */
export class StripeWebhookTenantNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.STRIPE_WEBHOOK_TENANT_NOT_FOUND) {
    super({ message, code: 'STRIPE_WEBHOOK_TENANT_NOT_FOUND' });
  }
}

/** Session `metadata.tenantId` doesn't match the caller; 404 to prevent probing other tenants. */
export class CheckoutSessionTenantMismatchException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.CHECKOUT_SESSION_TENANT_MISMATCH) {
    super({ message, code: 'CHECKOUT_SESSION_TENANT_MISMATCH' });
  }
}

/** Client input, so 400 rather than Stripe's `invalid_request_error` surfacing as 500. */
export class PaymentMethodNotUsableException extends BadRequestException {
  constructor(message: string = MESSAGES.BILLING.PAYMENT_METHOD_NOT_USABLE) {
    super({ message, code: 'PAYMENT_METHOD_NOT_USABLE' });
  }
}
