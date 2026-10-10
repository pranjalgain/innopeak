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

/** The business's public contact details, as the provider lists them for the review's location. */
export interface BusinessContact {
  phone: string | null;
  websiteUri: string | null;
}

export interface BuildSystemPromptInput {
  tone: PromptTone;
  /** > 1 asks for N distinct options in one call; pairs with `parseMultiSnippetReplies`. */
  snippetCount?: number;
  /** Absent or empty: the reply invites contact without naming how. */
  contact?: BusinessContact | null | undefined;
}

/** Collapses whitespace and caps length: these values come from the provider and land in the prompt verbatim. */
function cleanContactValue(value: string | null | undefined): string | null {
  const cleaned = value?.replace(/\s+/g, ' ').trim().slice(0, 300);
  return cleaned === undefined || cleaned === '' ? null : cleaned;
}

/**
 * The only contact details a reply may contain are the ones given here; otherwise models fill the gap with a
 * placeholder such as "[phone/email]", which must never reach a public reply.
 */
function buildContactRules(contact: BusinessContact | null | undefined): string {
  const phone = cleanContactValue(contact?.phone);
  const website = cleanContactValue(contact?.websiteUri);
  const details = [phone ? `phone ${phone}` : null, website ? `website ${website}` : null].filter(
    (detail): detail is string => detail !== null
  );

  const noPlaceholders =
    `Never write placeholders or bracketed text such as [phone], [email], [name] or [website]: ` +
    `every word must be ready to publish as-is.`;

  if (details.length === 0) {
    return (
      `${noPlaceholders} No contact details are available for this business, so if you invite ` +
      `the reviewer to get in touch, do it without naming a phone number, email address or website.`
    );
  }

  return (
    `${noPlaceholders} If you invite the reviewer to get in touch, use only these contact details ` +
    `for the business: ${details.join('; ')}. Do not invent any other contact details, such as an ` +
    `email address.`
  );
}

/**
 * Fixed platform behavior (format, tone, contact details); content rules such as the GDPR "don't repeat the
 * reviewer's name" live in the tenant-editable template instead.
 *
 * `snippetCount` > 1 asks for N distinct options in one call, since looping the single-reply
 * prompt yields near-duplicates; pairs with `parseMultiSnippetReplies`.
 */
export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const { tone, snippetCount = 1 } = input;
  const base =
    `You are drafting a public reply to a Google Business Profile review on behalf of a ` +
    `business. Write in a ${tone} tone throughout. Never invent facts, promises, discounts, or ` +
    `compensation beyond what your instructions below state. ${buildContactRules(input.contact)}`;

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
