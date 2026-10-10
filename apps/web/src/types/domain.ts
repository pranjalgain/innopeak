export interface Tenant {
  name: string;
  /** `null` when none is connected. Phone and website are as the business lists them on Google; its category and
   *  aggregate rating are never fetched, so they are not modelled here. */
  location: {
    name: string;
    address: string | null;
    phone: string | null;
    websiteUri: string | null;
    lastSyncedAt: string | null;
  } | null;
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

/** Both views the dashboard needs, derived from one fetch so the raw SDK response never crosses into a hook. */
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
  /** Null is reachable (`escalation_reason` is nullable): such a review renders no badge rather than a guessed one. */
  escalationReason: EscalationReason | null;
}

/** `removed`: its author deleted it on Google, so it can no longer be replied to. */
export type ReviewStatus = "new" | "in_review" | "responded" | "dismissed" | "removed";

export type ReviewClassification =
  | "auto_reply_candidate"
  | "escalated"
  | "unclassified"
  | "pending_classification";

export type ReplyDraftStatus = "pending_approval" | "approved" | "rejected" | "superseded";

/** Approving one supersedes any sibling still pending: only one reply can be posted per review. */
export interface ReviewReplyDraft {
  id: string;
  label: string;
  /** May differ from `originalContent` if an owner edited it before approving. */
  content: string;
  /** The AI's draft as generated; immutable. */
  originalContent: string;
  status: ReplyDraftStatus;
  /** Which prompt (and which of its versions) generated this draft — the link analytics is built on. */
  promptId: string;
  promptVersion: number;
  createdAt: string;
  /** Set when the owner approves or rejects (including when superseded by a sibling's approval). `null` while pending. */
  decidedAt: string | null;
  /** When Google confirmed the reply. The API folds `posted` and `post_failed` into `approved`, so
   *  this and `errorMessage` are how an approved draft's delivery is told apart. */
  postedAt: string | null;
  /** Why the last post attempt failed; `null` unless it did. Cleared when a retry is queued. */
  errorMessage: string | null;
}

export type ReplyDeliveryState = "not_posted" | "posted" | "failed";

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
  /** `null` when nothing is connected (or the connection state could not be read). */
  businessName: string | null;
  /** `null` until the first sync, or when nothing is connected. */
  lastSyncedAt: string | null;
  status: ConnectionStatus;
}

export interface SettingsData {
  general: GeneralSettings;
  blocklistTerms: BlocklistTerm[];
  notificationRecipients: NotificationRecipient[];
  connection: ConnectionInfo;
}

/** `email` is read-only here (changing a login email is a re-verification flow); `avatarUrl` is the only field this screen lets you change. */
export interface TenantOwnerProfile {
  name: string;
  email: string;
  avatarUrl: string | null;
  /** `false` for a Google/SSO-only account — Settings shows "Add password" instead of "Change password". */
  hasPassword: boolean;
  /** Read-only in Settings. */
  businessName: string;
  /** The shell's role badge reads this (see `MemberRole` for invited teammates). */
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

/** Draft outcomes for one prompt (optionally one version); `approvedAsIsCount`/`approvedEditedCount` split how often an owner had to rewrite the draft. */
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

/** Mirrors the real `google_connection_status` enum, flattened with a `disconnected` case for "no connection row exists yet". */
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

/** `email` is read-only (changing a login email is a re-verification flow); `avatarUrl` is the only field this screen lets you change. */
export interface PlatformAdminProfile {
  email: string;
  avatarUrl: string | null;
  /** `false` for a Google-only admin (accepted an invite via SSO): Settings shows "Add password" instead. */
  hasPassword: boolean;
}

/** Mirrors `platform_admins` (status) joined with its own `platform_admin_invites` row. */
export interface PlatformAdminInvite {
  id: string;
  email: string;
  status: PlatformAdminStatus;
  invitedAt: string;
  /** `null` for an admin never invited (the seeded root); only read while `status === "invited"`. */
  expiresAt: string | null;
  /** The seeded root: never invited, disable-able or revocable; the roster hides those actions for it. */
  isRoot: boolean;
}

/** The Super Admin overview's four stat cards — counts and throughput aggregated across every tenant. */
export interface AdminOverviewStats {
  businessCount: number;
  userCount: number;
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

/** `monthKey` as `YYYY-MM`. Always fully populated by the backend (a month with no signups is present with `count: 0`), so the frontend never fills gaps. */
export interface SignupTrendPoint {
  monthKey: string;
  count: number;
}

/** `monthKey` as `YYYY-MM`; always fully populated, same contract as `SignupTrendPoint`. */
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

/** `monthKey` as `YYYY-MM`; always fully populated like `SignupTrendPoint`. */
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

/** A payment that succeeded after its business asked to be deleted — refund due, not yet handled. */
export interface PostErasureCharge {
  receiptId: string;
  tenantId: string;
  businessName: string;
  invoiceNumber: string | null;
  /** Smallest currency unit (cents), as Stripe charged it. */
  amountPaid: number;
  /** Lowercase ISO 4217 code. */
  currency: string;
  paidAt: string;
}

export interface BillingWebhookEvent {
  id: string;
  type: string;
  processedAt: string;
  /** `null` for an orphan delivery — no tenant's Stripe customer id matches this event's. */
  tenantId: string | null;
  businessName: string | null;
}

/** Mirrors `StripeWebhookEventType` (backend `billing.type.ts`): the 5 types `BillingWebhooksService` acts on, the only
 *  ones the webhook-events endpoint returns. Keys, not raw Stripe wire strings, are the filter vocabulary (see
 *  `ListBillingWebhookEventsQueryDto.type`). */
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

/** `GET /v1/admin/billing/summary`. Webhook activity is separate and paginated (`BillingWebhookEventList`). */
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
  postErasureCharges: PostErasureCharge[];
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

/** Platform-wide feature settings, a single row (`platform_settings`) rather than per-tenant; read at runtime from `GET /v1/settings/platform-config`, including by signed-out visitors. */
export interface PlatformSettings {
  ssoLoginEnabled: boolean;
  passwordLoginEnabled: boolean;
  socialLoginEnabled: boolean;
  inviteMembersEnabled: boolean;
  /**
   * Whether billing exists in this deploy: reflects the backend's `PAYMENT_FEATURE_ENABLED` env var, not a runtime
   * setting (deliberately no admin UI). Gates every payment-related UI surface. Not retroactive: turning it off
   * does not affect a tenant already on the Paid plan.
   */
  paymentFeatureEnabled?: boolean;
}

/** A real `platform_activity_log` action; mirrors the backend's `platform_activity_type` enum exactly. The API does no
 *  runtime validation of `type` (a plain cast in `AdminActivityService`), so a missing value breaks `ActivityLogCard`'s
 *  exhaustive `Record`s. Also the Activity tab's filter vocabulary, which never includes `business_joined`. */
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

/** `"business_joined"` is not a real `platform_activity_type`: a signup has no admin actor, so the backend synthesizes it
 *  from `AdminBusinessSummary.createdAt` and merges it server-side into `GET /v1/admin/overview/activity` (`actorEmail`
 *  is `null`). The paginated Activity tab never returns it. */
export interface PlatformActivityEntry {
  id: string;
  type: PlatformActivityType | "business_joined";
  /** `null`, not omitted, for a synthesized `business_joined` entry; matches the backend DTO. Unlike `businessName`/`email`
   *  below, which the service coalesces to `undefined` since they are absent-vs-present by `type`. */
  actorEmail: string | null;
  /** The business a `business_*`/`business_joined` entry acted on. */
  businessName?: string;
  /** The email an `admin_invite_*` (invitee) or `user_*` (the tenant user) entry acted on. */
  email?: string;
  occurredAt: string;
}

/** `GET /v1/admin/overview/activity-log`: real `platform_activity_log` rows only, unlike the Overview feed
 *  (`business_joined` included, no pagination). */
export interface PlatformActivityList {
  activities: PlatformActivityEntry[];
  meta: PaginationMeta;
}

export type BillingPlanCode = "free" | "paid";

/** `null` on any `max*` field means unlimited. */
export interface BillingPlan {
  id: string;
  code: BillingPlanCode;
  maxLocations: number | null;
  maxAiDraftsPerMonth: number | null;
  maxTeamMembers: number | null;
  customPromptsEnabled: boolean;
}

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

/** Masked/tokenized data only (Stripe's `brand`/`last4`/expiry), never a raw card number. */
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
}

/** `GET /v1/billing/profile` — the two Stripe Customer fields this app lets a tenant edit
 *  in-app. */
export interface BillingProfile {
  name: string | null;
  email: string | null;
}

/** `GET /v1/billing/receipts` — one row per successfully paid Stripe invoice. Empty until the
 *  tenant has made a real payment. */
export interface Receipt {
  id: string;
  amountPaid: number;
  currency: string;
  invoiceNumber: string | null;
  paidAt: string;
}
