/**
 * What `AiProvider.generateReply` takes and returns — the boundary between "the tenant's prompt,
 * filled in" (this module's own business logic, `AiReplyGenerationService`) and "however this
 * particular model API wants that instruction phrased" (each concrete provider). Neither field
 * carries raw `{{placeholder}}` syntax or tenant-specific template text by the time a provider
 * sees it; providers only ever see two finished strings.
 */
export interface GenerateReplyInput {
  /** House-style rules that apply to every generated reply regardless of category — output
   *  format, tone, and the guardrails against inventing facts/promises. See
   *  `buildSystemPrompt` (`../utils/prompt-template.util.ts`). */
  systemPrompt: string;
  /** The tenant's prompt template for this review's category, with every required placeholder
   *  already substituted with real review data. */
  userPrompt: string;
  /**
   * Overrides `AI_MAX_OUTPUT_TOKENS` for this call. `AI_MAX_OUTPUT_TOKENS` is sized for one
   * ~60-80-word reply; `AiReplyGenerationService`'s multi-snippet escalation path asks for up to
   * `MAX_AI_REPLY_COUNT` replies in a single JSON-array completion and scales this up
   * proportionally, since the single-reply budget would risk truncating (and thus failing to
   * parse) a multi-reply response mid-array. `undefined` keeps the provider's own default.
   */
  maxOutputTokens?: number;
}

export interface GenerateReplyResult {
  content: string;
  /** The provider's own model identifier, echoed back rather than assumed — useful once a
   *  provider like OpenRouter can silently route to a different underlying model than the one
   *  requested (e.g. a `:free` variant falling back under load). */
  model: string;
  /** `null` when the provider's response didn't include usage accounting (not every
   *  OpenRouter-routed model reports it). */
  promptTokens: number | null;
  completionTokens: number | null;
  /** Wall-clock time for the provider call alone, measured by the provider itself — not
   *  including `AiReplyGenerationService`'s own DB reads before/after it. */
  latencyMs: number;
  /**
   * Why the model stopped. `'stop'` is the only value that means "this reply is complete";
   * `'length'` means it was cut off at `AI_MAX_OUTPUT_TOKENS` mid-sentence, which a real
   * generation pipeline must never hand to an owner as an approvable draft (PLAN.md §5) and which
   * a dry run should show rather than hide. Surfaced because it is otherwise invisible: a
   * truncated reply is a perfectly well-formed string, indistinguishable from a finished one
   * until someone reads it. `null` when the provider omits it.
   */
  finishReason: string | null;
}
