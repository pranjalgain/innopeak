import { createPlaceholderPattern } from '@prompts/constants/prompts.constants';
import type { PromptTone } from '@prompts/types/prompt.type';

/** The exact same pattern `PromptsService`'s own placeholder validation (`findUnknownPromptPlaceholders`)
 *  is built on — sharing it (rather than a second, hand-authored copy) is what guarantees this
 *  function only ever needs to fill placeholders that validation already allowed, with nothing
 *  more permissive or stricter for the two to silently drift apart on. `PromptsService` already
 *  validates that a saved template only ever contains allowlisted placeholders
 *  (`findUnknownPromptPlaceholders`), so by the time this runs, every `{{name}}` in `template` is
 *  one of `values`' own keys. */
const PLACEHOLDER_PATTERN = createPlaceholderPattern();

/**
 * Substitutes every `{{name}}` placeholder in `template` with `values[name]`. An unknown
 * placeholder (one with no matching key) is left untouched rather than replaced with an empty
 * string or throwing — `PromptsService.createVersion` is the actual enforcement point for "every
 * placeholder in a template must be one of the required four"; this function's job is filling a
 * template already known to be valid, not re-validating it.
 */
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
 * The instructions that apply to every generated reply regardless of category — output format
 * and tone. Content-specific instructions (what to acknowledge, word limits, the "don't repeat
 * the reviewer's name" GDPR house rule from PLAN.md §6) live in the tenant's own template text
 * instead (see `DEFAULT_PROMPTS`), not here: those vary per category and are exactly what an
 * owner is meant to be able to edit from Settings → Prompts, whereas this system prompt is fixed
 * platform behavior no tenant configures.
 *
 * `snippetCount` (default 1, the non-escalated/dry-run shape) switches the output-format half of
 * this prompt: asking the model for `snippetCount` reply options in **one** call, explicitly told
 * to make them differ meaningfully from one another, is what actually produces distinct A/B/C
 * choices for an escalated review's `tenant_settings.ai_reply_count` snippets — looping the
 * identical single-reply prompt N times and relying on sampling temperature alone tends to
 * produce near-duplicate rewordings rather than genuinely different options. The JSON-array
 * instruction is paired with `parseMultiSnippetReplies`, which enforces it on the way back out.
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
 * Parses the JSON-array response the multi-snippet branch of `buildSystemPrompt` asks the model
 * for, back into exactly `expectedCount` distinct reply strings. Returns `null` — rather than
 * throwing itself — on any shape mismatch (not JSON, not an array, wrong length, a blank or
 * non-string entry), so the caller decides how to react; `AiReplyGenerationService` throws
 * `AiGenerationFailedException` on `null`, the same exception class an empty/malformed
 * single-reply completion already maps to, so the existing per-candidate error handling (log,
 * release the claim, keep going) covers this without a special case.
 *
 * Tolerates the one real-world LLM quirk worth defending against despite the instruction saying
 * otherwise: the array wrapped in a ` ```json ` fenced code block.
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
