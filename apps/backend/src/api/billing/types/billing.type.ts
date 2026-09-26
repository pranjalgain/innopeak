import type { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import type { SubscriptionStatus } from '@common/enums/subscription-status.enum';

/** `PAYMENT_PROVIDER` env var — mirrors `StorageProviderType`'s shape in the media module. */
export type PaymentProviderType = 'dummy' | 'stripe';

/**
 * The tenant's plan entitlements plus their current usage against each — everything the four
 * `BillingEntitlementsService` checks and the §3a location-selection methods need in one read.
 * `null` on any `max*` field means unlimited, matching `billing_plans`'s own column semantics.
 */
export interface TenantEntitlements {
  planCode: BillingPlanCode;
  maxLocations: number | null;
  maxAiDraftsPerMonth: number | null;
  maxTeamMembers: number | null;
  customPromptsEnabled: boolean;
  /** Locations where `status = 'active' AND billing_paused_at IS NULL` — see
   *  `ConnectionsRepository.countActiveUnpausedLocations`. */
  activeLocationCount: number;
  /** Every roster row (owner + members, invited or active) — an invited-but-not-yet-accepted seat
   *  still consumes the cap, since the owner has already committed it to someone. */
  teamMemberCount: number;
  /** `review_responses` rows with `source = 'ai_generated'` since the start of the current
   *  calendar month (UTC). See `BillingEntitlementsService.canGenerateAiDraft`'s own doc comment
   *  for why nothing calls it yet. */
  aiDraftsUsedThisMonth: number;
}

// ─── Payment provider contracts ──────────────────────────────────────────────

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

/** Card metadata only — never the PAN itself, so displaying this carries no PCI scope. Stripe
 *  (and `DummyPaymentProvider`'s fixture) already hand back exactly this shape; a provider maps
 *  its own representation into it rather than `BillingService` reaching into a raw Stripe type. */
export interface PaymentMethodSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

/** Stripe's own `Customer.name`/`Customer.email` — the two billing-profile fields this app lets a
 *  tenant edit in-app (see `BillingService.updateBillingProfile`). `null` fields mean the Stripe
 *  customer has never had them set (e.g. `createCustomer` sets `email` but never `name`). */
export interface BillingProfile {
  name: string | null;
  email: string | null;
}

/** Both fields required — the in-app "billing profile" form always submits the whole thing, never
 *  a partial patch (unlike `TenantSubscriptionPatch`'s per-webhook-event partial shape). */
export interface UpdateBillingProfileInput {
  name: string;
  email: string;
}

/**
 * The normalized shape every concrete `PaymentProvider.constructWebhookEvent` maps its own raw
 * event format into, so `BillingWebhooksService` never touches a raw Stripe (or Dummy) type — see
 * `PaymentProvider`'s own doc comment. `status`/period fields are already narrowed to this app's
 * `SubscriptionStatus` (a deliberate subset of Stripe's own statuses — see
 * `0011_billing.sql`'s comment); a concrete provider is responsible for that mapping.
 */
export type PaymentWebhookEvent =
  | {
      id: string;
      /** Every Stripe event type this app does not act on — logged and skipped. `rawType` carries
       *  Stripe's own event type string for that log line. */
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
      /** Stripe's own invoice id (`in_...`) — the idempotency key `BillingReceiptsRepository`
       *  records a receipt under, distinct from `id` above (the webhook event id). */
      invoiceId: string;
      subscriptionId: string | null;
      /** Smallest currency unit (e.g. cents), verbatim from Stripe's own `amount_paid`. */
      amountPaid: number;
      /** Lowercase ISO 4217 code, verbatim from Stripe's own `currency`. */
      currency: string;
      invoiceNumber: string | null;
      paidAt: string;
    };
