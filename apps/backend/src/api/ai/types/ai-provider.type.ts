export interface GenerateReplyInput {
  /** House-style rules for every reply: output format, tone, guardrails against inventing facts. */
  systemPrompt: string;
  /** Tenant's template with every placeholder already substituted; providers never see `{{...}}`. */
  userPrompt: string;
  /** `AI_MAX_OUTPUT_TOKENS` fits one reply; multi-reply JSON-array calls scale it up so the array isn't truncated mid-parse. */
  maxOutputTokens?: number;
}

export interface GenerateReplyResult {
  content: string;
  /** Echoed from the provider, not assumed: OpenRouter can silently route to a different model. */
  model: string;
  /** `null` when the provider's response omits usage accounting. */
  promptTokens: number | null;
  completionTokens: number | null;
  /** Wall-clock time of the provider call alone, excluding DB reads. */
  latencyMs: number;
  /** Only `'stop'` means complete; `'length'` is a truncated reply that looks like a finished string, so it must never become an approvable draft. `null` when omitted. */
  finishReason: string | null;
}
