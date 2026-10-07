import { createPlaceholderPattern } from '@prompts/constants/prompts.constants';
import type { PromptTone } from '@prompts/types/prompt.type';

// Shared with `findUnknownPromptPlaceholders` so fill and validation can't drift apart.
const PLACEHOLDER_PATTERN = createPlaceholderPattern();

/** Unknown placeholders are left untouched, not blanked: `PromptsService.createVersion` is what enforces validity. */
export function fillPromptTemplate(
  template: string,
  values: Readonly<Record<string, string>>
): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, rawName: string) => {
    const name = rawName.trim().toLowerCase();
    return Object.hasOwn(values, name) ? (values[name] ?? match) : match;
  });
}

/**
 * Fixed platform behavior (format and tone); content rules such as the GDPR "don't repeat the
 * reviewer's name" live in the tenant-editable template instead.
 *
 * `snippetCount` > 1 asks for N distinct options in one call, since looping the single-reply
 * prompt yields near-duplicates; pairs with `parseMultiSnippetReplies`.
 */
export function buildSystemPrompt(tone: PromptTone, snippetCount = 1): string {
  const base =
    `You are drafting a public reply to a Google Business Profile review on behalf of a ` +
    `business. Write in a ${tone} tone throughout. Never invent facts, promises, discounts, or ` +
    `compensation beyond what your instructions below state.`;

  if (snippetCount <= 1) {
    return (
      `${base} Write only the reply text itself — no preamble, no explanation, no surrounding ` +
      `quotation marks, no markdown formatting.`
    );
  }

  return (
    `${base} Write exactly ${snippetCount} distinct reply options for this same review, each a ` +
    `complete, standalone reply a human could post as-is. The ${snippetCount} options must ` +
    `differ meaningfully from one another — in wording, structure, and approach, not just ` +
    `synonym swaps — while each still following the instructions below. Respond with ONLY a ` +
    `JSON array of exactly ${snippetCount} strings, one per option, in no particular order. No ` +
    `markdown, no code fences, no numbering, no surrounding commentary — the entire response ` +
    `body must be valid JSON and nothing else.`
  );
}

/**
 * Returns `null` on any shape mismatch so the caller decides how to fail. Tolerates the array
 * wrapped in a ```json fence, which models emit despite instructions.
 */
export function parseMultiSnippetReplies(content: string, expectedCount: number): string[] | null {
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    return null;
  }

  const trimmed: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      return null;
    }
    trimmed.push(item.trim());
  }

  return trimmed;
}
