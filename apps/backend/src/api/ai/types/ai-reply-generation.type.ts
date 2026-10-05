import type { PromptCategory, PromptTone } from '@prompts/types/prompt.type';

/** The mock review shape `AiReplyGenerationService` operates on. Exported here rather than
 *  declared inline in the service so `GenerateReplyDryRunDto`'s `MockReviewDto` can implement it
 *  (HTTP layer depending on the domain type, not the other way around) instead of the two
 *  drifting as two independent hand-copies of the same three fields. */
export interface MockReviewInput {
  reviewerName: string;
  rating: number;
  reviewText: string;
}

/** Groups `AiReplyGenerationService.generateDryRunReply`'s trailing scalars (module-structure
 *  rule 12). `templateOverride`/`toneOverride` are dry-run-only escape hatches — see that
 *  method's own doc comment for why they exist. */
export interface GenerateDryRunReplyInput {
  category: PromptCategory;
  review: MockReviewInput;
  templateOverride?: string;
  toneOverride?: PromptTone;
}

export interface GeneratedReply {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  /** See `GenerateReplyResult.finishReason` — anything other than `'stop'` means the reply is
   *  likely incomplete, which matters more than it looks: truncated text still reads as a valid
   *  string. */
  finishReason: string | null;
  category: PromptCategory;
  tone: PromptTone;
  usedTemplateOverride: boolean;
}

/** Groups `AiReplyGenerationService.generateForClassifiedReviews`'s trailing scalars (module-
 *  structure rule 12). */
export interface GenerateForClassifiedReviewsInput {
  tenantId: string;
  locationId: string;
}

export interface GenerationBatchResult {
  /** Persisted `review_responses` rows, not reviews processed — a non-escalated review produces
   *  exactly one, but an escalated review can produce up to `tenant_settings.ai_reply_count`
   *  (1-3) sharing one `generation_group_id`. This is also what the monthly AI-draft quota is
   *  spent against, one unit per row. */
  generated: number;
  /** Lost the claim CAS — another worker already generated for it, or its `status` moved off
   *  `new` in the window between the candidate read and the write. Mirrors
   *  `ClassifyPendingReviewsResult.skipped` exactly, same reasoning. */
  skipped: number;
  /** A real, per-review AI-call or persistence failure — logged where it happens and the claim
   *  released, but tallied here too so the caller (`ReviewSyncQueueService`) can tell "processed
   *  the batch, some rows failed" apart from "processed the batch cleanly." */
  failed: number;
  /** True when the tenant's plan-level monthly AI-draft quota was either already exhausted before
   *  this batch started, or ran out partway through it (an escalated candidate earlier in the
   *  same batch spent more than one unit) — either way, at least one fetched candidate was left
   *  untouched for the next tick to retry. Not folded into `skipped`: a skipped candidate lost a
   *  race with another worker, this one was never attempted at all. */
  quotaReached: boolean;
}
