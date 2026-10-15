export const AI_ERROR_CODES = {
  PROMPT_NOT_CONFIGURED: 'AI_PROMPT_NOT_CONFIGURED',
  PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  GENERATION_FAILED: 'AI_GENERATION_FAILED',
} as const;

/**
 * What fills `{{reviewer_name}}`: a reviewer's name is personal data and a reply must never use it, so the name is not
 * sent to the AI provider at all (the system prompt also forbids using a name that appears in the review text).
 */
export const ANONYMOUS_REVIEWER = 'a reviewer';

/** What fills `{{review_text}}` for a star-only review, which has no written comment. */
export const NO_WRITTEN_COMMENT = '(no written comment — rating only)';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Bounds cost/latency on a model that ignores the templates' 60-80 word limit. */
export const AI_MAX_OUTPUT_TOKENS = 400;

/** Identical replies every time read as robotic, but a review reply shouldn't be maximally creative. */
export const AI_TEMPERATURE = 0.7;

/** Per attempt; with `AI_MAX_RETRIES = 0` it is the hard ceiling on a call. Well above typical latency so it only fires on a stuck request. */
export const AI_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Explicitly 0, overriding the `openai` SDK default of 2: a stuck request would take 3 x
 * `AI_REQUEST_TIMEOUT_MS` (past most gateway timeouts), and silent retries would fold into
 * `latencyMs` and hide rate-limit flakiness this endpoint exists to observe.
 */
export const AI_MAX_RETRIES = 0;

/** Fallback when `tenants.name` is null. Deliberately generic, not the owner's email: it is woven
 *  into AI reply text that becomes a public review response. */
export const FALLBACK_BUSINESS_NAME = 'the business';

/**
 * Per-tick cap on billable generation calls per tenant+location, far below classification's
 * `BATCH_LIMIT`: each call is a seconds-long third-party round trip and a poll must finish well
 * inside its 15-minute cadence. The remainder is picked up on the next tick.
 */
export const GENERATION_BATCH_LIMIT = 20;

/**
 * Consecutive failures that end a generation batch early. An outage or expired key fails every
 * candidate, each costing a full `AI_REQUEST_TIMEOUT_MS` wait (up to ten minutes per tick).
 * Three, not one: a single failure is often specific to its review.
 */
export const MAX_CONSECUTIVE_GENERATION_FAILURES = 3;

/** Fallback when the `tenant_settings` row is missing; matches the column's `DEFAULT 2`. */
export const DEFAULT_AI_REPLY_COUNT = 2;
/** Clamp range, as defense in depth against the `CHECK (ai_reply_count BETWEEN 1 AND 3)`. */
export const MIN_AI_REPLY_COUNT = 1;
export const MAX_AI_REPLY_COUNT = 3;
