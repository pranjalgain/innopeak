import type { EscalationReason } from '@common/enums/escalation-reason.enum';
import type { ResponseSource } from '@common/enums/response-source.enum';
import type { ResponseStatus } from '@common/enums/response-status.enum';
import type { ResponseType } from '@common/enums/response-type.enum';
import type { ReviewClassification } from '@common/enums/review-classification.enum';
import type { ReviewSentiment } from '@common/enums/review-sentiment.enum';
import type { ReviewStatus } from '@common/enums/review-status.enum';
import type { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import type { SyncTrigger } from '@common/enums/sync-trigger.enum';

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
  /** Bumped on every progress write; the heartbeat the stale-run reclaim reads. */
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

/** `classification` is narrowed because the row only exists after `claimClassification` wrote one of these two values. */
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
  /** The prompt version the draft was generated from, so Settings > Prompts can count and rate replies per version. */
  promptVersionId: string;
  /** Non-null only for `ESCALATION_SNIPPET` rows. */
  generationGroupId: string | null;
  generationMetadata: Record<string, unknown>;
}

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
  /** Reviews whose reply lost a race against the live-reply index. Counted, never silent. */
  repliesSkippedConflict: number;
}

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
  // Drizzle infers a bare `jsonb` column as `unknown`; narrowed to what every writer stores.
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
  /** `null` is legitimate: the auto-post step approves with no human, and `null` records that truthfully. */
  approvedByUserId: string | null;
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
  /** Also find a review whose location is billing-paused: for the reply actions, which then refuse it with a reason instead of "not found". */
  includePaused?: boolean;
}

export interface ClaimResponseForPostingInput {
  responseId: string;
  tenantId: string;
}

export interface MarkResponsePostedInput {
  responseId: string;
  reviewId: string;
  /** Google's `reviewReply.updateTime`, not `now()`. */
  postedAt: string;
}

export interface ImportLiveReplyInput {
  tenantId: string;
  reviewId: string;
  content: string;
  postedAt: string;
}

export interface MarkResponsePostFailedInput {
  responseId: string;
  errorMessage: string;
}

export interface SupersedeForExternalReplyInput {
  responseId: string;
  reviewId: string;
  tenantId: string;
  /** The reply the freshness check found already live on Google. */
  content: string;
  postedAt: string;
}

export interface RetryPostableResponseInput {
  responseId: string;
  tenantId: string;
}

export interface InsertManualReplyInput {
  tenantId: string;
  reviewId: string;
  responseType: ResponseType;
  content: string;
  createdByUserId: string;
}

export interface FindResponsesForReviewsInput {
  reviewIds: string[];
  tenantId: string;
}

export interface GetPromptVersionStatsInput {
  tenantId: string;
  promptId: string;
  /** Omit to aggregate across every version. */
  version?: number;
}

export interface GetPromptVersionStatsBatchInput {
  tenantId: string;
  /** Always scoped to one version, unlike the single method's optional `version`. */
  pairs: Array<{ promptId: string; version: number }>;
}

export interface PromptVersionStatsBatchRow {
  promptId: string;
  version: number;
  stats: PromptVersionStatsRow;
}

/** `approvedAsIsCount` is absent on purpose: `PromptsService` derives it as `approvedCount - approvedEditedCount`. */
export interface PromptVersionStatsRow {
  totalGenerated: number;
  approvedCount: number;
  approvedEditedCount: number;
  rejectedCount: number;
  pendingCount: number;
  supersededCount: number;
  averageDecisionMinutes: number | null;
}
