import {
  DEMO_BUSINESS_NAME,
  DEMO_CONNECTION_ID,
  DEMO_LOCATION_ID,
  DEMO_MEMBER_EMAIL,
  DEMO_MEMBER_ID,
  DEMO_MEMBER_NAME,
  DEMO_OWNER_EMAIL,
  DEMO_OWNER_ID,
  DEMO_OWNER_NAME,
  DEMO_ROOT_ADMIN_EMAIL,
  DEMO_ROOT_ADMIN_ID,
  DEMO_SECOND_ADMIN_EMAIL,
  DEMO_SECOND_ADMIN_ID,
  DEMO_SECOND_BUSINESS_NAME,
  DEMO_SECOND_TENANT_ID,
  DEMO_SECOND_TENANT_OWNER_EMAIL,
  DEMO_SECOND_TENANT_OWNER_ID,
  DEMO_SECOND_TENANT_OWNER_NAME,
  DEMO_TENANT_ID,
} from "./constants";

// ─────────────────────────────────────────────────────────────────────────
// Row shapes — deliberately loose (not the SDK's own DTOs): this is the
// mock's own "database", and each handler maps a row to whatever DTO shape
// the real backend would have answered with.
// ─────────────────────────────────────────────────────────────────────────

export interface MockTenant {
  id: string;
  name: string;
  status: "active" | "suspended";
  activeLocationId: string | null;
  createdAt: string;
}

export interface MockUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: "owner" | "member";
  status: "active" | "invited" | "disabled" | "pending_verification";
  passwordHash: string | null;
  avatarUrl: string | null;
  locale: "en" | "de" | null;
  invitedAt: string;
  lastLoginAt: string | null;
}

export interface MockAdmin {
  id: string;
  email: string;
  status: "invited" | "active" | "disabled";
  invitedAt: string;
  expiresAt: string | null;
  isRoot: boolean;
  passwordHash: string | null;
  avatarUrl: string | null;
  locale: "en" | "de" | null;
}

export interface MockLocation {
  id: string;
  tenantId: string;
  connectionId: string;
  externalLocationId: string;
  name: string;
  address: string | null;
  status: "active" | "inactive";
  lastSyncedAt: string | null;
  lastSyncStatus: "ok" | "error" | null;
  lastSyncError: string | null;
  onboardingBackfillCompletedAt: string | null;
  createdAt: string;
}

export interface MockConnection {
  id: string;
  tenantId: string;
  providerAccountId: string;
  connectionStatus: "active" | "needs_reauth";
  connectedAt: string;
}

export interface MockAvailableLocation {
  externalLocationId: string;
  name: string;
  address: string | null;
}

export interface MockReviewResponse {
  id: string;
  reviewId: string;
  generationGroupId: string | null;
  label: string;
  responseType: "auto_reply_suggestion" | "escalation_snippet" | "imported_reply";
  content: string;
  originalContent: string | null;
  source: "ai_generated" | "human_edited" | "human_manual" | "imported";
  status: "pending_approval" | "approved" | "rejected" | "superseded";
  createdByUserId: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  decidedAt: string | null;
  postedAt: string | null;
  errorMessage: string | null;
}

export interface MockReview {
  id: string;
  tenantId: string;
  locationId: string;
  externalReviewId: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  reviewedAt: string;
  externalUpdatedAt: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  classification: "auto_reply_candidate" | "escalated" | "pending_classification";
  escalationReason: "low_rating" | "blocklist_match" | null;
  matchedKeywords: string[] | null;
  status: "new" | "in_review" | "responded" | "dismissed";
  anonymizedAt: string | null;
  removedUpstreamAt: string | null;
  responses: MockReviewResponse[];
}

export interface MockNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: "review_escalated" | "reply_needs_approval" | "reply_approved" | "connection_issue";
  title: string;
  description: string | null;
  reviewId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface MockNotificationRecipient {
  id: string;
  tenantId: string;
  userId: string;
  channel: "email" | "teams" | "both";
  isActive: boolean;
}

export interface MockBlocklistTerm {
  id: string;
  tenantId: string;
  term: string;
  createdAt: string;
}

export interface MockTenantSettings {
  tenantId: string;
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
  aiReplyCount: number;
  updatedAt: string;
}

export interface MockPromptVersion {
  id: string;
  version: number;
  template: string;
  createdAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
}

export interface MockPrompt {
  id: string;
  tenantId: string;
  category: "positive" | "neutral" | "escalated";
  name: string;
  description: string;
  tone: "friendly" | "professional" | "formal" | "playful" | "empathetic";
  versions: MockPromptVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface MockActivityEntry {
  id: string;
  type:
    | "business_suspended"
    | "business_reactivated"
    | "admin_invite_sent"
    | "admin_invite_revoked"
    | "user_activated"
    | "user_deactivated"
    | "admin_disabled"
    | "admin_enabled";
  actorEmail: string;
  businessName: string | null;
  email: string | null;
  occurredAt: string;
}

export interface MockBackfill {
  locationId: string;
  status: "running" | "ok" | "error";
  trigger: "scheduled" | "backfill";
  startedAt: string;
  completedAt: string | null;
  reviewsFetched: number | null;
  totalToImport: number | null;
}

export interface MockPlatformSettings {
  ssoLoginEnabled: boolean;
  passwordLoginEnabled: boolean;
  socialLoginEnabled: boolean;
  inviteMembersEnabled: boolean;
}

interface MockDb {
  tenants: MockTenant[];
  users: MockUser[];
  admins: MockAdmin[];
  locations: MockLocation[];
  connections: MockConnection[];
  availableLocations: MockAvailableLocation[];
  reviews: MockReview[];
  notifications: MockNotification[];
  notificationRecipients: MockNotificationRecipient[];
  blocklistTerms: MockBlocklistTerm[];
  tenantSettings: MockTenantSettings[];
  prompts: MockPrompt[];
  activity: MockActivityEntry[];
  backfills: MockBackfill[];
  platformSettings: MockPlatformSettings;
  nextId: number;
}

function daysAgo(days: number, hour = 12): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

const REVIEWER_NAMES = [
  "Jordan P.",
  "Aisha K.",
  "Miguel Santos",
  "Chloe Bennett",
  "Tariq Osei",
  "Lena Fischer",
  "Sam Whitfield",
  "Noor Haddad",
  "Ellery Voss",
  "Priyanka Nair",
  null, // anonymous reviewer
];

const POSITIVE_SNIPPETS = [
  "The grilled swordfish was outstanding and the staff remembered our anniversary from last year.",
  "Best clam chowder on the whole coast. We come back every time we're in Portland.",
  "Service was warm and quick even on a packed Friday night. Will absolutely return.",
  "Beautiful harbor view, generous portions, and the server walked us through the whole menu.",
];
const NEUTRAL_SNIPPETS = [
  "Food was good but the wait for a table ran almost 40 minutes with no reservation option.",
  "Solid meal, nothing that stood out, but nothing to complain about either.",
  "Portions were smaller than I expected for the price, though the flavor was there.",
];
const NEGATIVE_SNIPPETS = [
  "Waited 60 minutes past our reservation with no acknowledgment — food was fine but not worth it.",
  "Our order came out wrong twice and the manager never came by to apologize.",
  "Overpriced for what you get, and the fish tasted like it had been sitting under a heat lamp.",
  "Rude host at the front, and the dining room was freezing the entire time.",
];

interface BuildReviewInput {
  index: number;
  rating: number;
  ageDays: number;
  status: MockReview["status"];
  classification: MockReview["classification"];
  escalationReason?: MockReview["escalationReason"];
  matchedKeywords?: string[];
}

function buildReview(input: BuildReviewInput): MockReview {
  const id = `review_${String(input.index).padStart(3, "0")}`;
  const reviewerName = REVIEWER_NAMES[input.index % REVIEWER_NAMES.length] ?? null;
  const snippetPool =
    input.rating >= 4
      ? POSITIVE_SNIPPETS
      : input.rating === 3
        ? NEUTRAL_SNIPPETS
        : NEGATIVE_SNIPPETS;
  const reviewText = snippetPool[input.index % snippetPool.length] ?? null;
  const reviewedAt = daysAgo(input.ageDays, 9 + (input.index % 10));
  const sentiment: MockReview["sentiment"] =
    input.rating >= 4 ? "positive" : input.rating === 3 ? "neutral" : "negative";

  const responses: MockReviewResponse[] = [];
  if (input.status === "responded") {
    responses.push({
      id: `${id}_resp_1`,
      reviewId: id,
      generationGroupId: `${id}_group_1`,
      label: "A",
      responseType:
        input.classification === "escalated" ? "escalation_snippet" : "auto_reply_suggestion",
      content:
        input.rating >= 4
          ? `Thank you so much, ${reviewerName ?? "there"} — we're thrilled you had a great visit and hope to see you again soon!`
          : `We're sorry to hear this, ${reviewerName ?? "there"} — please reach out to us directly so we can make this right.`,
      originalContent: null,
      source: "ai_generated",
      status: "approved",
      createdByUserId: null,
      approvedByUserId: DEMO_OWNER_ID,
      createdAt: daysAgo(input.ageDays - 1, 10),
      decidedAt: daysAgo(input.ageDays - 1, 11),
      postedAt: daysAgo(input.ageDays - 1, 11),
      errorMessage: null,
    });
  } else if (input.classification !== "pending_classification" && input.rating <= 3) {
    responses.push({
      id: `${id}_resp_1`,
      reviewId: id,
      generationGroupId: `${id}_group_1`,
      label: "A",
      responseType:
        input.classification === "escalated" ? "escalation_snippet" : "auto_reply_suggestion",
      content: `We're sorry to hear this, ${reviewerName ?? "there"} — could you share more detail so our team can follow up?`,
      originalContent: null,
      source: "ai_generated",
      status: "pending_approval",
      createdByUserId: null,
      approvedByUserId: null,
      createdAt: daysAgo(input.ageDays, 12),
      decidedAt: null,
      postedAt: null,
      errorMessage: null,
    });
  }

  return {
    id,
    tenantId: DEMO_TENANT_ID,
    locationId: DEMO_LOCATION_ID,
    externalReviewId: `g_review_${String(input.index).padStart(3, "0")}`,
    reviewerName,
    rating: input.rating,
    reviewText,
    reviewedAt,
    externalUpdatedAt: reviewedAt,
    sentiment,
    classification: input.classification,
    escalationReason: input.escalationReason ?? null,
    matchedKeywords: input.matchedKeywords ?? null,
    status: input.status,
    anonymizedAt: null,
    removedUpstreamAt: null,
    responses,
  };
}

function seedReviews(): MockReview[] {
  const specs: BuildReviewInput[] = [
    {
      index: 1,
      rating: 5,
      ageDays: 1,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 2,
      rating: 1,
      ageDays: 1,
      status: "new",
      classification: "escalated",
      escalationReason: "low_rating",
    },
    {
      index: 3,
      rating: 4,
      ageDays: 2,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 4,
      rating: 2,
      ageDays: 3,
      status: "in_review",
      classification: "escalated",
      escalationReason: "low_rating",
    },
    {
      index: 5,
      rating: 5,
      ageDays: 4,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    { index: 6, rating: 3, ageDays: 5, status: "new", classification: "auto_reply_candidate" },
    {
      index: 7,
      rating: 5,
      ageDays: 6,
      status: "new",
      classification: "escalated",
      escalationReason: "blocklist_match",
      matchedKeywords: ["lawsuit"],
    },
    {
      index: 8,
      rating: 4,
      ageDays: 8,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 9,
      rating: 1,
      ageDays: 10,
      status: "dismissed",
      classification: "escalated",
      escalationReason: "low_rating",
    },
    {
      index: 10,
      rating: 5,
      ageDays: 12,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 11,
      rating: 3,
      ageDays: 15,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 12,
      rating: 2,
      ageDays: 18,
      status: "responded",
      classification: "escalated",
      escalationReason: "low_rating",
    },
    {
      index: 13,
      rating: 4,
      ageDays: 22,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 14,
      rating: 5,
      ageDays: 26,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 15,
      rating: 1,
      ageDays: 29,
      status: "responded",
      classification: "escalated",
      escalationReason: "low_rating",
    },
    {
      index: 16,
      rating: 5,
      ageDays: 35,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 17,
      rating: 4,
      ageDays: 45,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    {
      index: 18,
      rating: 2,
      ageDays: 60,
      status: "responded",
      classification: "escalated",
      escalationReason: "low_rating",
    },
    {
      index: 19,
      rating: 5,
      ageDays: 75,
      status: "responded",
      classification: "auto_reply_candidate",
    },
    { index: 20, rating: 0, ageDays: 80, status: "new", classification: "pending_classification" },
  ];
  // rating 0 above is a placeholder meaning "not yet rated a real 1-5" is impossible for Google
  // reviews, so give it a real rating too — kept separate only to mark it pending classification.
  return specs.map((spec) => buildReview({ ...spec, rating: spec.rating === 0 ? 3 : spec.rating }));
}

function seedNotifications(reviews: MockReview[]): MockNotification[] {
  const escalated = reviews.filter((review) => review.classification === "escalated");
  const notifications: MockNotification[] = escalated.map((review, index) => ({
    id: `notif_escalated_${String(index + 1).padStart(3, "0")}`,
    tenantId: DEMO_TENANT_ID,
    userId: DEMO_OWNER_ID,
    type: "review_escalated",
    title: "Review escalated",
    description: `A ${String(review.rating)}-star review from ${review.reviewerName ?? "an anonymous reviewer"} was flagged and needs your attention.`,
    reviewId: review.id,
    // The two most recent stay unread so the bell has something to show on first load.
    readAt: index < 2 ? null : daysAgo(0, 8),
    createdAt: review.reviewedAt,
  }));

  notifications.push({
    id: "notif_reply_needs_approval_001",
    tenantId: DEMO_TENANT_ID,
    userId: DEMO_OWNER_ID,
    type: "reply_needs_approval",
    title: "AI reply ready for review",
    description: "A drafted reply to a recent review is waiting for your approval.",
    reviewId: reviews[5]?.id ?? null,
    readAt: null,
    createdAt: daysAgo(0, 7),
  });

  notifications.push({
    id: "notif_connection_issue_001",
    tenantId: DEMO_TENANT_ID,
    userId: DEMO_OWNER_ID,
    type: "connection_issue",
    title: "Reconnect your Google Business Profile",
    description: "We couldn't refresh your review feed on the last sync attempt.",
    reviewId: null,
    readAt: daysAgo(6, 9),
    createdAt: daysAgo(7, 9),
  });

  return notifications;
}

function buildInitialState(): MockDb {
  const reviews = seedReviews();
  const now = new Date().toISOString();

  const tenants: MockTenant[] = [
    {
      id: DEMO_TENANT_ID,
      name: DEMO_BUSINESS_NAME,
      status: "active",
      activeLocationId: DEMO_LOCATION_ID,
      createdAt: daysAgo(240),
    },
    {
      id: DEMO_SECOND_TENANT_ID,
      name: DEMO_SECOND_BUSINESS_NAME,
      status: "suspended",
      activeLocationId: null,
      createdAt: daysAgo(120),
    },
  ];

  const users: MockUser[] = [
    {
      id: DEMO_OWNER_ID,
      tenantId: DEMO_TENANT_ID,
      name: DEMO_OWNER_NAME,
      email: DEMO_OWNER_EMAIL,
      role: "owner",
      status: "active",
      passwordHash: "mock",
      avatarUrl: null,
      locale: null,
      invitedAt: daysAgo(240),
      lastLoginAt: now,
    },
    {
      id: DEMO_MEMBER_ID,
      tenantId: DEMO_TENANT_ID,
      name: DEMO_MEMBER_NAME,
      email: DEMO_MEMBER_EMAIL,
      role: "member",
      status: "active",
      passwordHash: "mock",
      avatarUrl: null,
      locale: null,
      invitedAt: daysAgo(180),
      lastLoginAt: daysAgo(2),
    },
    {
      id: DEMO_SECOND_TENANT_OWNER_ID,
      tenantId: DEMO_SECOND_TENANT_ID,
      name: DEMO_SECOND_TENANT_OWNER_NAME,
      email: DEMO_SECOND_TENANT_OWNER_EMAIL,
      role: "owner",
      status: "active",
      passwordHash: "mock",
      avatarUrl: null,
      locale: null,
      invitedAt: daysAgo(120),
      lastLoginAt: daysAgo(30),
    },
  ];

  const admins: MockAdmin[] = [
    {
      id: DEMO_ROOT_ADMIN_ID,
      email: DEMO_ROOT_ADMIN_EMAIL,
      status: "active",
      invitedAt: daysAgo(300),
      expiresAt: null,
      isRoot: true,
      passwordHash: "mock",
      avatarUrl: null,
      locale: null,
    },
    {
      id: DEMO_SECOND_ADMIN_ID,
      email: DEMO_SECOND_ADMIN_EMAIL,
      status: "active",
      invitedAt: daysAgo(90),
      expiresAt: null,
      isRoot: false,
      passwordHash: "mock",
      avatarUrl: null,
      locale: null,
    },
  ];

  const connections: MockConnection[] = [
    {
      id: DEMO_CONNECTION_ID,
      tenantId: DEMO_TENANT_ID,
      providerAccountId: "google-account-coastal-table",
      connectionStatus: "active",
      connectedAt: daysAgo(230),
    },
  ];

  const locations: MockLocation[] = [
    {
      id: DEMO_LOCATION_ID,
      tenantId: DEMO_TENANT_ID,
      connectionId: DEMO_CONNECTION_ID,
      externalLocationId: "g_location_coastal_downtown",
      name: DEMO_BUSINESS_NAME,
      address: "214 Harborview St, Portland, ME",
      status: "active",
      lastSyncedAt: daysAgo(0, 6),
      lastSyncStatus: "ok",
      lastSyncError: null,
      onboardingBackfillCompletedAt: daysAgo(229),
      createdAt: daysAgo(230),
    },
  ];

  const availableLocations: MockAvailableLocation[] = [
    {
      externalLocationId: "g_location_coastal_downtown",
      name: DEMO_BUSINESS_NAME,
      address: "214 Harborview St, Portland, ME",
    },
    {
      externalLocationId: "g_location_coastal_pier",
      name: "The Coastal Table — Pier House",
      address: "9 Pier House Rd, Portland, ME",
    },
  ];

  const notifications = seedNotifications(reviews);

  const notificationRecipients: MockNotificationRecipient[] = [
    {
      id: "recip_owner",
      tenantId: DEMO_TENANT_ID,
      userId: DEMO_OWNER_ID,
      channel: "both",
      isActive: true,
    },
    {
      id: "recip_member",
      tenantId: DEMO_TENANT_ID,
      userId: DEMO_MEMBER_ID,
      channel: "email",
      isActive: false,
    },
  ];

  const blocklistTerms: MockBlocklistTerm[] = [
    { id: "block_1", tenantId: DEMO_TENANT_ID, term: "lawsuit", createdAt: daysAgo(200) },
    { id: "block_2", tenantId: DEMO_TENANT_ID, term: "health inspector", createdAt: daysAgo(150) },
  ];

  const tenantSettings: MockTenantSettings[] = [
    {
      tenantId: DEMO_TENANT_ID,
      escalationRatingThreshold: 3,
      autoPostEnabled: false,
      reviewDataRetentionMonths: 24,
      aiReplyCount: 2,
      updatedAt: daysAgo(30),
    },
  ];

  const promptDefaults: {
    category: MockPrompt["category"];
    name: string;
    description: string;
    template: string;
  }[] = [
    {
      category: "positive",
      name: "Positive review reply",
      description: "Used for 4-5 star reviews with no escalation triggers.",
      template:
        "Thank you so much, {{reviewerName}}! We're thrilled you enjoyed your visit to {{businessName}} and hope to see you again soon.",
    },
    {
      category: "neutral",
      name: "Neutral review reply",
      description: "Used for 3 star reviews with no escalation triggers.",
      template:
        "Thanks for the feedback, {{reviewerName}} — we're always looking to improve and would love another chance to impress you.",
    },
    {
      category: "escalated",
      name: "Escalated review snippet",
      description: "A short opener a team member edits before posting to an escalated review.",
      template:
        "We're sorry to hear about your experience, {{reviewerName}}. Please reach out to us directly at {{businessPhone}} so we can make this right.",
    },
  ];

  const prompts: MockPrompt[] = promptDefaults.map((defaults, index) => ({
    id: `prompt_${String(index + 1)}`,
    tenantId: DEMO_TENANT_ID,
    category: defaults.category,
    name: defaults.name,
    description: defaults.description,
    tone: "friendly",
    createdAt: daysAgo(230),
    updatedAt: daysAgo(230),
    versions: [
      {
        id: `prompt_${String(index + 1)}_v1`,
        version: 1,
        template: defaults.template,
        createdAt: daysAgo(230),
        createdByUserId: null,
        createdByName: null,
      },
    ],
  }));

  const activity: MockActivityEntry[] = [
    {
      id: "activity_1",
      type: "business_suspended",
      actorEmail: DEMO_ROOT_ADMIN_EMAIL,
      businessName: DEMO_SECOND_BUSINESS_NAME,
      email: null,
      occurredAt: daysAgo(20),
    },
    {
      id: "activity_2",
      type: "admin_invite_sent",
      actorEmail: DEMO_ROOT_ADMIN_EMAIL,
      businessName: null,
      email: DEMO_SECOND_ADMIN_EMAIL,
      occurredAt: daysAgo(90),
    },
    {
      id: "activity_3",
      type: "user_deactivated",
      actorEmail: DEMO_ROOT_ADMIN_EMAIL,
      businessName: null,
      email: DEMO_MEMBER_EMAIL,
      occurredAt: daysAgo(45),
    },
    {
      id: "activity_4",
      type: "user_activated",
      actorEmail: DEMO_ROOT_ADMIN_EMAIL,
      businessName: null,
      email: DEMO_MEMBER_EMAIL,
      occurredAt: daysAgo(44),
    },
  ];

  const backfills: MockBackfill[] = [
    {
      locationId: DEMO_LOCATION_ID,
      status: "ok",
      trigger: "backfill",
      startedAt: daysAgo(230, 8),
      completedAt: daysAgo(230, 9),
      reviewsFetched: reviews.length,
      totalToImport: reviews.length,
    },
  ];

  const platformSettings: MockPlatformSettings = {
    ssoLoginEnabled: true,
    passwordLoginEnabled: true,
    socialLoginEnabled: true,
    inviteMembersEnabled: true,
  };

  return {
    tenants,
    users,
    admins,
    locations,
    connections,
    availableLocations,
    reviews,
    notifications,
    notificationRecipients,
    blocklistTerms,
    tenantSettings,
    prompts,
    activity,
    backfills,
    platformSettings,
    nextId: 1000,
  };
}

let db: MockDb = buildInitialState();

/** The mock's whole "database" — a module-level singleton, reset only by a hard page reload
 *  (there is no server to persist to, and none of this is meant to survive one). */
export function getDb(): MockDb {
  return db;
}

/** Rarely needed — mainly here so a future "reset demo data" affordance has somewhere to call. */
export function resetDb(): void {
  db = buildInitialState();
}

export function nextMockId(prefix: string): string {
  db.nextId += 1;
  return `${prefix}_${String(db.nextId)}`;
}
