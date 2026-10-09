import type { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import type { SubscriptionStatus } from '@common/enums/subscription-status.enum';

/** `null` on any `max*` field means unlimited. */
export interface TenantEntitlements {
  planCode: BillingPlanCode;
  maxLocations: number | null;
  maxAiDraftsPerMonth: number | null;
  maxTeamMembers: number | null;
  customPromptsEnabled: boolean;
  /** Locations with `status = 'active' AND billing_paused_at IS NULL`. */
  activeLocationCount: number;
  /** Includes invited-but-not-accepted seats, which still consume the cap. */
  teamMemberCount: number;
  /** AI-generated `review_responses` since the start of the current calendar month (UTC). */
  aiDraftsUsedThisMonth: number;
}

export interface CreateCustomerInput {
  tenantId: string;
  email: string;
}

export interface CreateCheckoutSessionInput {
  tenantId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreatePortalSessionInput {
  customerId: string;
  returnUrl: string;
}

/** A live subscription fetched from Stripe's API, as opposed to one webhook event's fields. */
export interface SubscriptionSnapshot {
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * `tenantId` is null only for a session this app never created; `subscription` is null until payment
 * completes (abandoned checkout, or `success_url` hit before Stripe finishes processing).
 */
export interface CheckoutSessionSnapshot {
  tenantId: string | null;
  subscription: SubscriptionSnapshot | null;
}

/** What `PaymentProvider.prepareNewCheckout` found before a new Checkout is opened. */
export interface NewCheckoutPreparation {
  /** The customer already has a live subscription the local row may not know about yet (webhook not landed). */
  hasLiveSubscription: boolean;
}

/** Card metadata only, never the PAN, so showing it carries no PCI scope. */
export interface PaymentMethodSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

/** `null` means the Stripe customer never had it set (`createCustomer` sets email but never name). */
export interface BillingProfile {
  name: string | null;
  email: string | null;
}

/** Both fields required: the form always submits the whole profile, never a partial patch. */
export interface UpdateBillingProfileInput {
  name: string;
  email: string;
}

/** Normalized so `BillingWebhooksService` never touches a raw Stripe type; `status` is a deliberate subset of Stripe's (see `0011_billing.sql`). */
type PaymentWebhookEventBody =
  | {
      id: string;
      /** Event types this app does not act on; `rawType` is Stripe's own type string for the log line. */
      type: 'unhandled';
      rawType: string;
    }
  | {
      id: string;
      type: 'checkout.session.completed';
      customerId: string;
      subscriptionId: string;
      status: SubscriptionStatus;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
    }
  | {
      id: string;
      type: 'customer.subscription.deleted';
      customerId: string;
      subscriptionId: string;
    }
  | {
      id: string;
      type: 'customer.subscription.updated';
      customerId: string;
      subscriptionId: string;
      status: SubscriptionStatus;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    }
  | {
      id: string;
      type: 'invoice.payment_failed';
      customerId: string;
    }
  | {
      id: string;
      type: 'invoice.payment_succeeded';
      customerId: string;
      /** Stripe's invoice id (`in_...`): the receipt's idempotency key, distinct from webhook event `id`. */
      invoiceId: string;
      subscriptionId: string | null;
      /** Smallest currency unit (e.g. cents), verbatim from Stripe's own `amount_paid`. */
      amountPaid: number;
      /** Lowercase ISO 4217 code, verbatim from Stripe's own `currency`. */
      currency: string;
      invoiceNumber: string | null;
      paidAt: string;
    };

/** `createdAt` is optional; used to stop retrying deliveries for an unknown customer once it is clearly not transient. */
export type PaymentWebhookEvent = PaymentWebhookEventBody & { createdAt?: string };

/** The 5 event types `handleEvent` acts on; a runtime value so the admin webhook view can tell handled from ignored events. Update alongside `PaymentWebhookEvent`. */
export const StripeWebhookEventType = {
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  INVOICE_PAYMENT_SUCCEEDED: 'invoice.payment_succeeded',
} as const;

export type HandledStripeWebhookEventType =
  (typeof StripeWebhookEventType)[keyof typeof StripeWebhookEventType];

/** Public filter vocabulary, so Stripe's dotted wire format never appears in a URL. */
export type StripeWebhookEventTypeKey = keyof typeof StripeWebhookEventType;

export const HANDLED_STRIPE_EVENT_TYPES: readonly HandledStripeWebhookEventType[] =
  Object.values(StripeWebhookEventType);
