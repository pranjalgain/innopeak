import type { BusinessContact } from '../utils/prompt-template.util';

/** What a reply is drafted on behalf of: the business name for the template, its contact details for the system prompt. */
export interface BusinessForReply {
  name: string;
  contact: BusinessContact | null;
}

export interface GenerateForClassifiedReviewsInput {
  tenantId: string;
  locationId: string;
}

export interface GenerationBatchResult {
  /** Persisted `review_responses` rows, not reviews: an escalated review can yield up to `ai_reply_count` (1-3). Also the unit the monthly AI-draft quota is spent in. */
  generated: number;
  /** Lost the claim CAS: another worker generated for it, or its `status` moved off `new`. */
  skipped: number;
  /** Per-review AI-call or persistence failure; the claim is released. */
  failed: number;
  /** Monthly AI-draft quota ran out before or during the batch; leftover candidates retry next tick. Not counted in `skipped`, which means lost a race. */
  quotaReached: boolean;
}
