/** Machine-facing codes the frontend can branch on — see `ai.exceptions.ts`. Mirrors
 *  `PROMPT_ERROR_CODES`'s own reasoning (`@prompts/constants/prompts.constants`). */
export const AI_ERROR_CODES = {
  PROMPT_NOT_CONFIGURED: 'AI_PROMPT_NOT_CONFIGURED',
  PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  GENERATION_FAILED: 'AI_GENERATION_FAILED',
} as const;

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/** Generous but bounded — a reply is meant to read as one short paragraph (the default prompt
 *  templates themselves cap replies at 60-80 words), so this exists to bound cost/latency on a
 *  model that ignores the template's own word-count instruction, not to allow long output. */
export const AI_MAX_OUTPUT_TOKENS = 400;

/** Some, but not maximal, creativity — a reply that's word-for-word identical every time reads as
 *  robotic, but a review reply is not the place for a model's most creative sampling either. */
export const AI_TEMPERATURE = 0.7;

/** Applied per attempt. With `AI_MAX_RETRIES = 0` below, one attempt is the whole call, so this
 *  is also the hard ceiling on how long a dry run can hang. Chosen well above typical
 *  chat-completion latency (a few seconds) so it only fires on a genuinely stuck request. */
export const AI_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Explicitly 0, overriding the `openai` SDK's own default of **2** — which would otherwise apply
 * silently, since nothing in this codebase chose it. Two inherited retries cost this endpoint
 * more than they buy it:
 *  - **Wall clock**: a genuinely stuck request becomes 3 × `AI_REQUEST_TIMEOUT_MS` plus backoff
 *    (~90s+) before the caller sees `AiGenerationFailedException` — past the point most gateways
 *    have already returned a 504 of their own.
 *  - **Honest latency**: `GenerateReplyResult.latencyMs` is measured around the SDK call, so
 *    silent retries fold into it. This endpoint exists to observe what a model actually returns
 *    and how fast, so a number that quietly includes two failed attempts is worse than useless.
 *  - **Visibility**: free-tier OpenRouter models rate-limit often; during this evaluation phase
 *    seeing that flakiness is the point, not having it papered over.
 *
 * Revisit when generation becomes load-bearing (the real classification → generation pipeline,
 * PLAN.md §5): retries belong there as a deliberate, logged policy alongside §8's race handling,
 * not as an SDK default nobody picked.
 */
export const AI_MAX_RETRIES = 0;

/** `AiReplyGenerationService.resolveBusinessName`'s fallback when `tenants.name` is somehow null
 *  (`name` is required at signup, so this should never actually trigger). Deliberately a generic,
 *  non-identifying phrase rather than the requesting owner's own email: unlike
 *  `BillingService.downloadReceiptPdf`'s identical-looking fallback (a PDF only that same owner
 *  ever sees), this string gets woven into `{{business_name}}` inside AI-generated reply text
 *  that is meant to become a **public**, third-party-visible review response — leaking a
 *  tenant's owner's personal email into that text on a data-integrity anomaly is a materially
 *  worse outcome than a generic phrase. Written to read naturally in the default templates'
 *  "You are replying on behalf of {{business_name}} to a ..." phrasing. */
export const FALLBACK_BUSINESS_NAME = 'the business';

/**
 * The per-tick ceiling on real, billable generation calls for one tenant+location —
 * deliberately much smaller than `ReviewClassificationService`'s own `BATCH_LIMIT` (2000).
 * Classification is a handful of cheap, synchronous, in-process comparisons per review; each
 * generation candidate is a real HTTP round trip to a third-party model that can take several
 * seconds (§8.1's overlapping-run guard assumes a poll finishes well inside its own 15-minute
 * cadence, and a five-figure batch of sequential AI calls would blow well past that). A tenant
 * whose backlog exceeds this cap is not left stuck — `findClassifiedNeedingGeneration`'s own doc
 * comment covers why the remainder is simply picked up on the next tick, the same self-healing
 * shape `BATCH_LIMIT` truncation already relies on for classification.
 */
export const GENERATION_BATCH_LIMIT = 20;

/**
 * How many consecutive per-review failures end a generation batch early. A provider outage, an
 * expired key or upstream rate limiting fails *every* candidate identically, and without a stop
 * condition each one still costs a claim write, a full `AI_REQUEST_TIMEOUT_MS` wait and a release
 * write — up to `GENERATION_BATCH_LIMIT × 30s` (ten minutes) of a poll tick spent failing, every
 * fifteen minutes, against a run that `acquireSyncRun` reclaims as stale after thirty.
 *
 * Three, not one: a single failure is genuinely often specific to its review (a model refusing one
 * piece of content, a malformed template), and abandoning a batch over it would strand the rest
 * for a tick. Three in a row is no longer plausibly about the reviews.
 */
export const MAX_CONSECUTIVE_GENERATION_FAILURES = 3;
