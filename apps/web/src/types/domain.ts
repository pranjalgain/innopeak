/**
 * Shared domain types for InnoPeak's mock data layer. Field/enum names
 * intentionally mirror the real backend schema (see
 * apps/backend/docs/schema.dbml, apps/backend/docs/PLAN.md) so swapping mock
 * services for real API calls later doesn't require reshaping data that's
 * already flowing through hooks and components.
 */

/** Which identity a mock login session belongs to — `super_admin` is a platform-level identity, distinct from any tenant. */
export type SessionRole = "tenant" | "super_admin";

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
  rangeLabel: string;
  reviewCount: number;
  averageRating: number;
  pendingApproval: number;
  escalatedOpen: number;
  /** Median minutes from review received to reply approved; null when nothing was approved in the range. */
  medianApprovalTimeMinutes: number | null;
}

export interface RatingDistributionRow {
  star: 1 | 2 | 3 | 4 | 5;
  count: number;
  percentage: number;
}

/** Mirrors `review_responses.source`/`status` on the real schema: how a reply reached its final state. */
export type ApprovalOutcome = "approved_as_is" | "approved_edited" | "rejected";

export interface ApprovalBreakdownRow {
  outcome: ApprovalOutcome;
  count: number;
  percentage: number;
}

export interface EscalationBreakdownRow {
  reason: EscalationReason;
  count: number;
  percentage: number;
}

export type EscalationReason = "low_rating" | "blocklist_match";

export interface AttentionReview {
  id: string;
  reviewerName: string;
  initials: string;
  rating: number;
  snippet: string;
  escalationReason: EscalationReason;
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
  reviewDataRetentionMonths: number;
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
  email: string;
  avatarUrl: string | null;
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

export type BusinessStatus = "active" | "suspended";

/** Mirrors the real `google_connection_status` enum, flattened with a `disconnected` case for "no connection row exists yet" (see the connections module plan). */
export type BusinessConnectionStatus = "connected" | "needs_reauth" | "disconnected";

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
}

/** Mirrors `platform_admins` (status) joined with its own `platform_admin_invites` row. */
export interface PlatformAdminInvite {
  id: string;
  email: string;
  status: PlatformAdminStatus;
  invitedAt: string;
  expiresAt: string;
}

/** Platform-wide review throughput, aggregated across every tenant — shown on the Super Admin overview. */
export interface PlatformReviewStats {
  totalReviewsFetched: number;
  totalRepliesSent: number;
}

/** A platform-admin action worth surfacing on the Super Admin overview's activity feed. */
export type PlatformActivityType =
  | "business_suspended"
  | "business_reactivated"
  | "admin_invite_sent"
  | "admin_invite_revoked";

export interface PlatformActivityEntry {
  id: string;
  type: PlatformActivityType;
  actorEmail: string;
  /** The business a `business_*` entry acted on. */
  businessName?: string;
  /** The invitee email an `admin_invite_*` entry acted on. */
  email?: string;
  occurredAt: string;
}
