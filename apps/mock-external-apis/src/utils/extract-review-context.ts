/**
 * The prompt template is already filled by the time it reaches this mock, so this reads the values
 * back out of the user message. It matches DEFAULT_PROMPTS' fixed wording ("a N-star review from
 * NAME." / `Review: "..."`); a tenant-edited template just falls back to null (dev-only emulator).
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

/** Long reviews shouldn't be echoed back in full. */
export function excerpt(text: string, maxLength = 60): string {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
}
