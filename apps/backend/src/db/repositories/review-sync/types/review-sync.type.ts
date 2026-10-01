import type { EscalationReason } from '@common/enums/escalation-reason.enum';
import type { ResponseSource } from '@common/enums/response-source.enum';
import type { ResponseStatus } from '@common/enums/response-status.enum';
import type { ResponseType } from '@common/enums/response-type.enum';
import type { ReviewClassification } from '@common/enums/review-classification.enum';
import type { ReviewSentiment } from '@common/enums/review-sentiment.enum';
import type { ReviewStatus } from '@common/enums/review-status.enum';
import type { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import type { SyncTrigger } from '@common/enums/sync-trigger.enum';

// ─── review-sync.repository.ts ───────────────────────────────────────────────

export interface SyncRunRow {
  id: string;
  tenantId: string;
  locationId: string;
  trigger: SyncTrigger;
  startedAt: string;
  completedAt: string | null;
  status: SyncRunStatus;
  reviewsFetched: number | null;
  reviewsTotal: number | null;
  errorMessage: string | null;
  /** Bumped on every progress write — the heartbeat both the reclaim predicate and `isStale` read. */
  updatedAt: string;
}

export interface UpsertReviewInput {
  tenantId: string;
  locationId: string;
  externalReviewId: string;
  externalReviewerId: string | null;
  rating: number;
  reviewText: string | null;
  reviewerName: string | null;
  reviewedAt: string;
  externalUpdatedAt: string;
  status: ReviewStatus;
}

export interface InsertImportedReplyInput {
  tenantId: string;
  reviewId: string;
  content: string;
  postedAt: string;
}

export interface PendingClassificationRow {
  id: string;
  rating: number;
  reviewText: string | null;
}

export interface ClaimClassificationInput {
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
  escalationReason: EscalationReason | null;
  matchedKeywords: string[] | null;
}

/** What `findClassifiedNeedingGeneration` reads — everything `AiReplyGenerationService` needs to
 *  draft a reply, and nothing else. `classification` is narrowed the same way
 *  `ClaimClassificationInput`'s is: this row only ever exists because `claimClassification`
 *  already wrote one of these two values, `pending_classification` is not a real possibility. */
export interface GenerationCandidateRow {
  id: string;
  rating: number;
  reviewText: string | null;
  reviewerName: string | null;
  classification: ReviewClassification.AUTO_REPLY_CANDIDATE | ReviewClassification.ESCALATED;
}

export interface InsertGeneratedResponseInput {
  tenantId: string;
  reviewId: string;
  responseType: ResponseType.AUTO_REPLY_SUGGESTION | ResponseType.ESCALATION_SNIPPET;
  content: string;
  /** Non-null only for `ESCALATION_SNIPPET` rows — see that constant's own doc comment in
   *  `ai-reply-generation.service.ts` for why an escalated review still gets a group id even
   *  while only one snippet is generated per review today. */
  generationGroupId: string | null;
  generationMetadata: Record<string, unknown>;
}

// ─── review-sync.db-service.ts ───────────────────────────────────────────────

export interface ImportReviewInput {
  externalReviewId: string;
  externalReviewerId: string | null;
  reviewerName: string | null;
  rating: number;
  text: string | null;
  reviewedAt: string;
  externalUpdatedAt: string;
  reply: { comment: string; updatedAt: string } | null;
}

export interface ImportPageInput {
  tenantId: string;
  locationId: string;
  reviews: ImportReviewInput[];
}

export interface ImportPageResult {
  reviewsWritten: number;
  reviewsInserted: number;
  repliesImported: number;
  /** Reviews whose reply lost a race against the *live-reply* index. Counted, never silent. */
  repliesSkippedConflict: number;
}

// ─── reviews-read.repository.ts ──────────────────────────────────────────────

export interface ReviewRow {
  id: string;
  locationId: string;
  externalReviewId: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  reviewedAt: string | null;
  externalUpdatedAt: string | null;
  sentiment: ReviewSentiment | null;
  classification: ReviewClassification;
  escalationReason: EscalationReason | null;
  // Drizzle infers a bare `jsonb` column as `unknown`; narrowed here to what every writer
  // actually stores (`ReviewSyncRepository.claimClassification`'s `ClaimClassificationInput`),
  // the same boundary-bridging this repository already does for enum columns.
  matchedKeywords: string[] | null;
  status: ReviewStatus;
  anonymizedAt: string | null;
  removedUpstreamAt: string | null;
}

export interface ReviewResponseRow {
  id: string;
  reviewId: string;
  generationGroupId: string | null;
  responseType: ResponseType;
  content: string;
  originalContent: string | null;
  source: ResponseSource;
  status: ResponseStatus;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  rejectedByUserId: string | null;
  createdAt: string;
  decidedAt: string | null;
  postedAt: string | null;
  errorMessage: string | null;
}

export interface ApproveResponseInput {
  responseId: string;
  reviewId: string;
  tenantId: string;
  approvedByUserId: string;
  /** Final content to store — possibly edited from the draft's own `content`. */
  content: string;
  source: ResponseSource;
}

export interface RejectResponseInput {
  responseId: string;
  reviewId: string;
  tenantId: string;
  rejectedByUserId: string;
}

export interface FindResponseForTenantInput {
  responseId: string;
  reviewId: string;
  tenantId: string;
}

export interface ListReviewsFilter {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: ReviewStatus | undefined;
  classification?: ReviewClassification | undefined;
  locationId?: string | undefined;
  search?: string | undefined;
}

export interface FindReviewByIdForTenantInput {
  reviewId: string;
  tenantId: string;
}

export interface FindResponsesForReviewsInput {
  reviewIds: string[];
  tenantId: string;
}

export interface GetPromptVersionStatsInput {
  tenantId: string;
  promptId: string;
  /** Omit to aggregate across every version of the prompt; pass to scope to one version. */
  version?: number;
}

export interface GetPromptVersionStatsBatchInput {
  tenantId: string;
  /** Every (promptId, version) pair to aggregate — each is always scoped to one version, unlike
   *  the single-stats method's optional `version`, since a batch caller always knows which
   *  version it wants per prompt (`usePromptAnalytics`'s current-version-per-prompt use case). */
  pairs: Array<{ promptId: string; version: number }>;
}

export interface PromptVersionStatsBatchRow {
  promptId: string;
  version: number;
  stats: PromptVersionStatsRow;
}

/**
 * `approvedAsIsCount` is deliberately absent — it's `approvedCount - approvedEditedCount`, plain
 * arithmetic on two numbers this repository already computed, not a query of its own. Computed by
 * the caller (`PromptsService`), not here.
 */
export interface PromptVersionStatsRow {
  totalGenerated: number;
  approvedCount: number;
  approvedEditedCount: number;
  rejectedCount: number;
  pendingCount: number;
  supersededCount: number;
  averageDecisionMinutes: number | null;
}
