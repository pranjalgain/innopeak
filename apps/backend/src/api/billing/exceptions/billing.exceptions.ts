import { MESSAGES } from '@common/constants/messages.constants';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

/** `PAYMENT_FEATURE_ENABLED` is off — gates `POST /v1/billing/checkout` only (the upgrade entry
 *  point), never an already-subscribed tenant's existing access. */
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

/** Should never fire in practice — every tenant gets a `free` subscription row in the same
 *  transaction that creates it (`AuthDbService.signup`/`completeGoogleSignup`). */
export class SubscriptionNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.SUBSCRIPTION_NOT_FOUND) {
    super({ message, code: 'SUBSCRIPTION_NOT_FOUND' });
  }
}

/** `POST /v1/billing/checkout` called by a tenant who already has a live Stripe subscription
 *  (`stripeSubscriptionId` already set, or `plan_id` already `paid`) — without this guard, a
 *  double-click/two-tab race could each mint a fresh, separately-billed Stripe Checkout Session
 *  and, if both were completed, two live subscriptions for one tenant with only the second's id
 *  ever recorded locally. See `BillingService.createCheckoutSession`. */
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

/** `BillingEntitlementsService.canGenerateAiDraft` — currently unreachable, see that method's own
 *  doc comment. Defined now so the generation pipeline has a ready-made exception to throw. */
export class AiDraftLimitReachedException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.AI_DRAFT_LIMIT_REACHED) {
    super({ message, code: 'AI_DRAFT_LIMIT_REACHED' });
  }
}

/** `Stripe.webhooks.constructEvent` rejected the signature — the webhook route's entire trust
 *  boundary, since it is `@Public()` with no JWT. */
export class StripeWebhookSignatureInvalidException extends BadRequestException {
  constructor(message: string = MESSAGES.BILLING.STRIPE_WEBHOOK_SIGNATURE_INVALID) {
    super({ message, code: 'STRIPE_WEBHOOK_SIGNATURE_INVALID' });
  }
}

/** `PUT /v1/billing/active-location` named a location that isn't this tenant's own, or is
 *  `status = 'inactive'` (disconnected) — see `BillingEntitlementsService.setActiveLocationForPlan`. */
export class LocationNotEligibleForActivationException extends BadRequestException {
  constructor(message: string = MESSAGES.BILLING.LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION) {
    super({ message, code: 'LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION' });
  }
}

/** In-app card/billing-profile editing (`GET`/`PUT /v1/billing/profile`, `POST
 *  /v1/billing/setup-intent`, `PUT /v1/billing/payment-method`) only exists for real Stripe —
 *  `DummyPaymentProvider` has no real Customer object behind it to read or edit. */
export class StripeOnlyFeatureException extends ForbiddenException {
  constructor(message: string = MESSAGES.BILLING.STRIPE_ONLY_FEATURE) {
    super({ message, code: 'STRIPE_ONLY_FEATURE' });
  }
}

/** `GET /v1/billing/receipts/:id/pdf` (or the list) named a receipt that doesn't exist, or belongs
 *  to a different tenant — the two cases are indistinguishable from the caller's own subscription,
 *  same as any other tenant-scoped lookup in this app. */
export class ReceiptNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.RECEIPT_NOT_FOUND) {
    super({ message, code: 'RECEIPT_NOT_FOUND' });
  }
}

/** `POST /v1/billing/dummy/*` called while `PAYMENT_PROVIDER=stripe` — these routes only exist to
 *  let a dummy checkout/portal confirmation page complete what a real Stripe webhook would
 *  otherwise deliver, and must never be reachable (a free-upgrade path with no payment behind it)
 *  once a deployment is actually running real Stripe. */
export class DummyProviderNotActiveException extends NotFoundException {
  constructor(message: string = MESSAGES.BILLING.DUMMY_PROVIDER_NOT_ACTIVE) {
    super({ message, code: 'DUMMY_PROVIDER_NOT_ACTIVE' });
  }
}
