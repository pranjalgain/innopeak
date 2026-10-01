/**
 * Shared domain types for InnoPeak's mock data layer. Field/enum names
 * intentionally mirror the real backend schema (see
 * apps/backend/docs/schema.dbml, apps/backend/docs/PLAN.md) so swapping mock
 * services for real API calls later doesn't require reshaping data that's
 * already flowing through hooks and components.
 */

export interface Tenant {
  id: string;
  name: string;
  /** Google Business Profile category, e.g. "Seafood restaurant". */
  businessType: string;
  address: string;
  phone: string;
  /** Google's own aggregate rating/review count — distinct from InnoPeak's review queue stats. */
  googleRating: number;
  googleReviewCount: number;
}

export type DateRange = "7d" | "30d" | "90d";

export interface DashboardStats {
  range: DateRange;
  reviewCount: number;
  averageRating: number;
  pendingApproval: number;
  escalatedOpen: number;
}

export interface RatingDistributionRow {
  star: 1 | 2 | 3 | 4 | 5;
  count: number;
  percentage: number;
}

/** `DashboardService.getMetrics`'s domain-shaped return — both views the dashboard needs derived
 *  from the one underlying fetch, so the raw generated-SDK response never has to cross into a hook. */
export interface DashboardMetrics {
  stats: DashboardStats;
  ratingDistribution: RatingDistributionRow[];
}

export type EscalationReason = "low_rating" | "blocklist_match";

export interface AttentionReview {
  id: string;
  reviewerName: string;
  initials: string;
  rating: number;
  snippet: string;
  /** Null is reachable: `escalation_reason` is nullable, so a review escalated without a recorded
   * reason renders no badge rather than a guessed one. */
  escalationReason: EscalationReason | null;
}

export type ReviewStatus = "new" | "in_review" | "responded" | "dismissed";

export type ReviewClassification =
  | "auto_reply_candidate"
  | "escalated"
  | "unclassified"
  | "pending_classification";

export type ReplyDraftStatus = "pending_approval" | "approved" | "rejected" | "superseded";

/**
 * An AI-drafted reply candidate for a review. Approving one automatically
 * supersedes any sibling draft still pending approval — only one reply can
 * ever be posted per review.
 */
export interface ReviewReplyDraft {
  id: string;
  label: string;
  /** The current text — may differ from `originalContent` if an owner edited it before approving. */
  content: string;
  /** The AI's draft as generated, before any owner edits. Immutable — never changes after creation. */
  originalContent: string;
  status: ReplyDraftStatus;
  /** Which prompt (and which of its versions) generated this draft — the link analytics is built on. */
  promptId: string;
  promptVersion: number;
  createdAt: string;
  /** Set when the owner approves or rejects (including when superseded by a sibling's approval). `null` while pending. */
  decidedAt: string | null;
}

export interface Review {
  id: string;
  reviewerName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  reviewText: string;
  reviewedAt: string;
  classification: ReviewClassification | null;
  escalationReason: EscalationReason | null;
  status: ReviewStatus;
  /** Empty for reviews the AI hasn't drafted replies for yet. */
  replyDrafts: ReviewReplyDraft[];
}

export interface ReviewQueueFilters {
  status: ReviewStatus | "all";
  classification: ReviewClassification | "all";
  search: string;
}

export type NotificationChannel = "email" | "teams" | "both";

export interface BlocklistTerm {
  id: string;
  term: string;
}

export interface NotificationRecipient {
  id: string;
  name: string;
  initials: string;
  channel: NotificationChannel;
  isActive: boolean;
}

export interface GeneralSettings {
  escalationRatingThreshold: 1 | 2 | 3 | 4 | 5;
  autoPostApprovedReplies: boolean;
  /** `null` means the platform default retention window. */
  reviewDataRetentionMonths: number | null;
  aiReplyCount: number;
}

export type ConnectionStatus = "connected" | "disconnected";

export interface ConnectionInfo {
  businessName: string;
  lastSyncedAt: string;
  status: ConnectionStatus;
}

export interface SettingsData {
  general: GeneralSettings;
  blocklistTerms: BlocklistTerm[];
  notificationRecipients: NotificationRecipient[];
  connection: ConnectionInfo;
}

/**
 * The signed-in tenant owner's own profile — `email` mirrors `users.email`
 * (`apps/backend`'s `0002_tenant_auth.sql`) and is read-only here (changing
 * a login email is a re-verification flow, not a plain settings edit).
 * `avatarUrl` is the only field this screen lets you change directly.
 */
export interface TenantOwnerProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
  /** `false` for a Google/SSO-only account — Settings shows "Add password" instead of "Change password". */
  hasPassword: boolean;
  /** The tenant/company name set at signup (`tenants.name`) — read-only in Settings. */
  businessName: string;
  /** The shell's own role badge reads this — see `MemberRole` for the invited-teammate case, which `DashboardLayout` had no way to distinguish from an owner before this field existed. */
  role: MemberRole;
}

/** Mirrors the real `user_role`/`user_status` enums on the tenant-scoped `users` table. */
export type MemberRole = "owner" | "member";
export type MemberStatus = "pending_verification" | "invited" | "active" | "disabled";

export interface TenantMember {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  invitedAt: string;
  /** Set once removal has been requested for this member — null means no removal is pending. */
  erasureRequestedAt: string | null;
}

export type PromptTone = "friendly" | "professional" | "formal" | "playful" | "empathetic";

/** One immutable edit to a prompt's template — every save appends a new entry, never overwrites. */
export interface PromptVersion {
  version: number;
  template: string;
  updatedAt: string;
  updatedByName: string;
}

export interface AiPrompt {
  id: string;
  name: string;
  description: string;
  /** Ordered oldest → newest; the last entry is the current version. */
  versions: PromptVersion[];
  /** The tenant's current tone for this prompt — a live setting, not per-user. */
  tone: PromptTone;
}

/**
 * Draft outcomes for one prompt (optionally scoped to a single version) —
 * the answer to "is this prompt actually producing replies owners keep?".
 * `approvedAsIsCount`/`approvedEditedCount` split out how often an owner had
 * to rewrite the AI's draft before approving it, not just whether it was
 * eventually approved.
 */
export interface PromptVersionStats {
  totalGenerated: number;
  approvedCount: number;
  approvedAsIsCount: number;
  approvedEditedCount: number;
  rejectedCount: number;
  pendingCount: number;
  supersededCount: number;
  /** Average minutes between a draft's creation and its decision. `null` when nothing has been decided yet. */
  averageDecisionMinutes: number | null;
}

/** One (promptId, version) pair's stats — `PromptService.getVersionStatsBatch`'s per-item shape. */
export interface PromptVersionStatsBatchItem {
  promptId: string;
  version: number;
  stats: PromptVersionStats;
}

export type NotificationType =
  | "review_escalated"
  | "reply_needs_approval"
  | "reply_approved"
  | "connection_issue";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  createdAt: string;
  isRead: boolean;
  /** Present when the notification links to a specific review. */
  reviewId?: string;
}

export type BusinessStatus = "active" | "suspended" | "erased";

/** Mirrors the real `google_connection_status` enum, flattened with a `disconnected` case for "no connection row exists yet" (see the connections module plan). */
export type BusinessConnectionStatus =
  | "connected"
  | "needs_reauth"
  | "disconnected"
  /** Signed up but never finished onboarding — distinct from having lost a working connection. */
  | "never_connected";

/** A tenant as seen from the Super Admin area — "business" is this area's user-facing term for a tenant; distinct from `Tenant`, which models the current business from inside its own dashboard. */
export interface AdminBusiness {
  id: string;
  name: string;
  status: BusinessStatus;
  connectionStatus: BusinessConnectionStatus;
  ownerName: string;
  ownerEmail: string;
  userCount: number;
  createdAt: string;
  /** Set once erasure has been requested for this business — null means no erasure is pending. */
  erasureRequestedAt: string | null;
}

/** A user as seen across all businesses from the Super Admin area. */
export interface AdminUser {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  email: string;
  role: "owner" | "member";
  isActive: boolean;
  lastLoginAt: string | null;
}

/** Mirrors the real `platform_admin_status` enum (`apps/backend`'s `0000_foundation.sql`). */
export type PlatformAdminStatus = "invited" | "active" | "disabled";

/**
 * The signed-in super admin's own profile. `email` mirrors the real
 * `platform_admins` table (`apps/backend`'s `0001_platform_admin.sql`) and is
 * read-only here — changing a login email is a re-verification flow, not a
 * plain settings edit. `avatarUrl` is the only field this screen lets you
 * change directly; there's no name column to mirror either.
 */
export interface PlatformAdminProfile {
  email: string;
  avatarUrl: string | null;
  /** `false` for a Google-only admin (accepted an invite via SSO) — Settings shows "Add
   *  password" instead of "Change password" for those. */
  hasPassword: boolean;
}

/** Mirrors `platform_admins` (status) joined with its own `platform_admin_invites` row. */
export interface PlatformAdminInvite {
  id: string;
  email: string;
  status: PlatformAdminStatus;
  invitedAt: string;
  /** When a pending invite lapses. `null` for an admin that was never invited (the seeded root) —
   * only meaningful, and only read, while `status === "invited"`. */
  expiresAt: string | null;
  /** The seeded root admin — never invited, never disable-able, never revocable. The roster hides
   * those actions for this row regardless of who's viewing it. */
  isRoot: boolean;
}

/** The Super Admin overview's four stat cards — counts and throughput aggregated across every tenant. */
export interface AdminOverviewStats {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

/** One calendar month's tenant-signup count, `monthKey` as `YYYY-MM`. The window is always fully
 *  populated by the backend — a month with no signups is still present, with `count: 0` — so the
 *  frontend never needs to fill gaps itself. */
export interface SignupTrendPoint {
  monthKey: string;
  count: number;
}

/** One calendar month's review-volume figures, `monthKey` as `YYYY-MM` — always fully populated
 *  by the backend (a month with none is still present, at zero), same contract as `SignupTrendPoint`. */
export interface ReviewsTrendPoint {
  monthKey: string;
  reviewsFetched: number;
  repliesSent: number;
}

export interface RatingDistributionPoint {
  rating: number;
  count: number;
}

export interface ClassificationBreakdownPoint {
  classification: ReviewClassification;
  count: number;
}

export interface ConnectionHealth {
  connected: number;
  needsReauth: number;
  disconnected: number;
  neverConnected: number;
}

/** The Super Admin Statistics page's whole first screen — `GET /v1/admin/statistics/summary`. */
export interface AdminStatisticsSummary {
  replyRatePercent: number;
  avgRating: number;
  syncSuccessRatePercent: number;
  connectionHealth: ConnectionHealth;
  reviewsTrend: ReviewsTrendPoint[];
  ratingDistribution: RatingDistributionPoint[];
  classificationBreakdown: ClassificationBreakdownPoint[];
}

/** One calendar month's Free-to-Paid upgrade count, `monthKey` as `YYYY-MM` — same
 *  always-fully-populated contract as `SignupTrendPoint`. */
export interface UpgradeTrendPoint {
  monthKey: string;
  count: number;
}

/** Mirrors `subscription_status` (`apps/backend`'s `0011_billing.sql`). */
export type BillingSubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

export interface AtRiskSubscription {
  tenantId: string;
  businessName: string;
  status: BillingSubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface BillingWebhookEvent {
  id: string;
  type: string;
  processedAt: string;
  /** `null` for an orphan delivery — no tenant's Stripe customer id matches this event's. */
  tenantId: string | null;
  businessName: string | null;
}

/** Mirrors `StripeWebhookEventType` (`apps/backend`'s `billing.type.ts`) — the 5 event types
 *  `BillingWebhooksService` actually acts on, and the only ones `GET /v1/admin/billing/webhook-events`
 *  ever returns — every other Stripe event type this app receives and ignores never reaches this
 *  admin view at all. Key names, not the raw Stripe wire strings, are this app's own filter
 *  vocabulary — see `ListBillingWebhookEventsQueryDto.type`'s own comment for why the raw format
 *  never appears in a URL. */
export const StripeWebhookEventType = {
  CHECKOUT_SESSION_COMPLETED: "checkout.session.completed",
  SUBSCRIPTION_UPDATED: "customer.subscription.updated",
  SUBSCRIPTION_DELETED: "customer.subscription.deleted",
  INVOICE_PAYMENT_FAILED: "invoice.payment_failed",
  INVOICE_PAYMENT_SUCCEEDED: "invoice.payment_succeeded",
} as const;

export type StripeWebhookEventTypeKey = keyof typeof StripeWebhookEventType;
export type HandledStripeWebhookEventType =
  (typeof StripeWebhookEventType)[StripeWebhookEventTypeKey];
export const HANDLED_STRIPE_WEBHOOK_EVENT_TYPES = Object.values(
  StripeWebhookEventType,
) as HandledStripeWebhookEventType[];

/** The Super Admin Billing page's whole first screen — `GET /v1/admin/billing/summary`. Webhook
 *  activity is a separate, paginated concern (`BillingWebhookEventList` below), not part of this
 *  one-shot summary. */
export interface AdminBillingSummary {
  freeCount: number;
  paidCount: number;
  activeCount: number;
  pastDueCount: number;
  canceledCount: number;
  incompleteCount: number;
  cancelingCount: number;
  upgradeTrend: UpgradeTrendPoint[];
  atRisk: AtRiskSubscription[];
}

/** Shared page/pageSize/total/totalPages envelope for a paginated list — mirrors the backend's
 *  `PaginationMetaDto`. */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** `GET /v1/admin/billing/webhook-events` — paginated, filterable Stripe webhook activity. */
export interface BillingWebhookEventList {
  events: BillingWebhookEvent[];
  meta: PaginationMeta;
}

/**
 * Platform-wide feature settings — a single row (`apps/backend`'s `platform_settings` table),
 * not per-tenant. Which login methods the sign-in/sign-up screens offer, and whether a tenant
 * owner's Settings > Members tab can send invites. Replaces what used to be build-time
 * `NEXT_PUBLIC_*` env vars: a Super Admin now changes these at runtime from Admin Settings, and
 * every visitor (including a signed-out one on the login screen) reads the current value from
 * `GET /v1/settings/platform-config`.
 */
export interface PlatformSettings {
  ssoLoginEnabled: boolean;
  passwordLoginEnabled: boolean;
  socialLoginEnabled: boolean;
  inviteMembersEnabled: boolean;
  /**
   * Whether billing exists in this deploy at all — a pure reflection of the backend's
   * `PAYMENT_FEATURE_ENABLED` env var, not a runtime-toggleable setting (there is deliberately no
   * admin UI to flip this; see that env var's own doc comment in `env.config.ts` for why one
   * switch, not two). Gates every payment-related UI surface: the onboarding "choose your plan"
   * step's "Upgrade to Paid" option, the tenant Settings "Billing" tab, and the admin "Billing"
   * nav item/dashboard. Never retroactive — turning it off has no effect on a tenant already on
   * the Paid plan.
   */
  paymentFeatureEnabled?: boolean;
}

/** A real platform-admin action from `platform_activity_log`. Mirrors the backend's
 *  `platform_activity_type` enum exactly — the API performs no runtime validation of `type` on
 *  the way out (a plain cast in `AdminActivityService`), so a value missing here is a value this
 *  union silently lies about, breaking `ActivityLogCard`'s exhaustive `Record`s render. Used as
 *  the paginated Activity tab's own filter vocabulary (`PlatformActivityFilter`) — that view never
 *  includes `business_joined` (see `PlatformActivityEntry`'s own comment for why). */
export type PlatformActivityType =
  | "business_suspended"
  | "business_reactivated"
  | "business_erasure_requested"
  | "business_erasure_cancelled"
  | "business_erased"
  | "admin_invite_sent"
  | "admin_invite_revoked"
  | "admin_disabled"
  | "admin_enabled"
  | "user_activated"
  | "user_deactivated";

/** One entry in the Overview page's activity feed. `"business_joined"` isn't a real
 *  `platform_activity_type` — a signup has no platform-admin actor at all, so the backend
 *  synthesizes it from `AdminBusinessSummary.createdAt` and merges it into
 *  `GET /v1/admin/overview/activity`'s response server-side (`actorEmail` is `null` for those
 *  entries) rather than the frontend fetching a second endpoint and merging it client-side. The
 *  paginated Activity tab (`GET /v1/admin/overview/activity-log`) never returns this variant. */
export interface PlatformActivityEntry {
  id: string;
  type: PlatformActivityType | "business_joined";
  /** `null`, not omitted, for a synthesized `business_joined` entry — a signup has no
   *  platform-admin actor at all. Matches the backend DTO's own `string | null` exactly, unlike
   *  `businessName`/`email` below (which the service layer does coalesce to `undefined`, since
   *  those two are genuinely absent-vs-present depending on `type`, not always-present-but-null). */
  actorEmail: string | null;
  /** The business a `business_*`/`business_joined` entry acted on. */
  businessName?: string;
  /** The email an `admin_invite_*` (invitee) or `user_*` (the tenant user) entry acted on. */
  email?: string;
  occurredAt: string;
}

/** `GET /v1/admin/overview/activity-log` — paginated, filterable platform-admin action history.
 *  Real `platform_activity_log` rows only — distinct from the Overview glance card's merged feed
 *  (`GET /v1/admin/overview/activity`, `business_joined` entries included), which has no
 *  server-side pagination of its own. */
export interface PlatformActivityList {
  activities: PlatformActivityEntry[];
  meta: PaginationMeta;
}

// ─── Billing ──────────────────────────────────────────────────────────────

export type BillingPlanCode = "free" | "paid";

/** One row of `GET /v1/billing/plans` — the catalog entry, not the tenant's own usage (see
 *  `Subscription` below for that). `null` on any `max*` field means unlimited. */
export interface BillingPlan {
  id: string;
  code: BillingPlanCode;
  maxLocations: number | null;
  maxAiDraftsPerMonth: number | null;
  maxTeamMembers: number | null;
  customPromptsEnabled: boolean;
}

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

/** The tenant's on-file card, as reported by the active payment provider — masked/tokenized data
 *  only (Stripe's own `brand`/`last4`/expiry), never a raw card number. */
export interface PaymentMethodSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

/** `GET /v1/billing/subscription` — the tenant's current plan, Stripe subscription state (if
 *  any), and live entitlement usage against each capped dimension. */
export interface Subscription {
  planCode: BillingPlanCode;
  status: SubscriptionStatus | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** True while a canceled subscription is still inside its paid grace period — `planCode` stays
   *  `"paid"` with unlimited entitlements until the period actually ends. */
  cancelAtPeriodEnd: boolean;
  activeLocationCount: number;
  maxLocations: number | null;
  teamMemberCount: number;
  maxTeamMembers: number | null;
  aiDraftsUsedThisMonth: number;
  maxAiDraftsPerMonth: number | null;
  customPromptsEnabled: boolean;
  /** `null` for Free tenants, or a Paid tenant with no card on file yet. */
  paymentMethod: PaymentMethodSummary | null;
  /** The active `PAYMENT_PROVIDER` — gates in-app card/billing-profile editing to `"stripe"` only
   *  (see the backend's `StripeOnlyFeatureException`); a Dummy-provider tenant falls back to the
   *  simulated `/billing/dummy-portal` page instead. */
  paymentProvider: "stripe" | "dummy";
}

/** `GET /v1/billing/profile` — the two Stripe Customer fields this app lets a tenant edit
 *  in-app. Stripe-only, same gating as `Subscription.paymentProvider`. */
export interface BillingProfile {
  name: string | null;
  email: string | null;
}

/** `GET /v1/billing/receipts` — one row per successfully paid Stripe invoice. Stripe-only: always
 *  empty for a Dummy-provider tenant, since there is no real charge behind it to document. */
export interface Receipt {
  id: string;
  amountPaid: number;
  currency: string;
  invoiceNumber: string | null;
  paidAt: string;
}
