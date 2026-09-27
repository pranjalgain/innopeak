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
 */
export function buildSystemPrompt(tone: PromptTone): string {
  return (
    `You are drafting a public reply to a Google Business Profile review on behalf of a ` +
    `business. Write only the reply text itself — no preamble, no explanation, no surrounding ` +
    `quotation marks, no markdown formatting. Write in a ${tone} tone throughout. Never invent ` +
    `facts, promises, discounts, or compensation beyond what your instructions below state.`
  );
}
