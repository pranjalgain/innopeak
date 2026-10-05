/**
 * By the time a chat-completions request reaches this mock server, the real
 * `fillPromptTemplate` has already substituted `{{business_name}}`/`{{reviewer_name}}`/
 * `{{rating}}`/`{{review_text}}` into real text — there is nothing left to "fill." This file's job
 * is the inverse: read those real values back out of the user message so the composed reply can
 * actually reference them, rather than returning one fixed string regardless of input. Matches
 * `DEFAULT_PROMPTS`' own fixed wording (`apps/backend/src/api/prompts/constants/default-prompts.constant.ts`)
 * — "a {{rating}}-star review from {{reviewer_name}}" / `Review: "{{review_text}}"` — so extraction
 * is a handful of anchored regexes, not a parser. A tenant that has edited its own template away
 * from that wording just gets the graceful `null` fallback below; this is a dev-only emulator, not
 * a tenant-arbitrary-template parser.
 */
export interface ExtractedReviewContext {
  rating: number | null;
  reviewerName: string | null;
  reviewText: string | null;
}

export function extractReviewContext(userPrompt: string): ExtractedReviewContext {
  const ratingMatch = /\ba (\d+)-star review\b/i.exec(userPrompt);
  const reviewerMatch = /\breview from ([^.\n]+)\./i.exec(userPrompt);
  const textMatch = /Review:\s*"([^"]*)"/s.exec(userPrompt);

  return {
    rating: ratingMatch?.[1] ? Number(ratingMatch[1]) : null,
    reviewerName: reviewerMatch?.[1]?.trim() ?? null,
    reviewText: textMatch?.[1]?.trim() ?? null,
  };
}

/** A short, ellipsis-safe excerpt for quoting inside a composed reply — long reviews shouldn't be
 *  echoed back in full. */
export function excerpt(text: string, maxLength = 60): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
}
