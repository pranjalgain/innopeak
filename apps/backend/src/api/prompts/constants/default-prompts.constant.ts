import type { PromptCategory, PromptTone } from '../types/prompt.type';

export interface DefaultPrompt {
  category: PromptCategory;
  name: string;
  description: string;
  /** Must satisfy `findMissingRequiredPromptPlaceholders` (tested). */
  template: string;
}

/**
 * Written into `prompts` + `prompt_versions` in the email-verification transaction
 * (`AuthDbService.provisionTenantWorkspace`), not at signup, since a `pending_verification` tenant
 * may never activate. A TypeScript constant rather than a migration: a migration runs once, so
 * later tenants would get nothing, and a constant can be type-checked and tested against the
 * placeholder allowlist.
 */
export const DEFAULT_PROMPTS: readonly DefaultPrompt[] = [
  {
    category: 'positive',
    name: 'Positive review reply',
    description:
      'Used for 4-5 star reviews. Keep it warm and specific to what the reviewer praised.',
    template: `You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Reply in the same language the review is written in. If the review text contains both a Google machine translation and the reviewer's original wording, follow the original. If the language is unclear, reply in English.

Write a warm, genuine thank-you reply. Mention something specific from the review if possible. Keep it under 60 words and avoid generic phrases like "we appreciate your feedback." Do not repeat the reviewer's name.`,
  },
  {
    category: 'neutral',
    name: 'Neutral review reply',
    description: 'Used for 3-star reviews with mixed feedback.',
    template: `You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Reply in the same language the review is written in. If the review text contains both a Google machine translation and the reviewer's original wording, follow the original. If the language is unclear, reply in English.

Acknowledge both the positive and constructive points in the review. Invite the reviewer to give the business another visit. Keep it under 70 words. Do not repeat the reviewer's name.`,
  },
  {
    category: 'escalated',
    name: 'Negative / escalated review reply',
    description: 'Used for 1-2 star reviews and reviews escalated to the team.',
    template: `You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Reply in the same language the review is written in. If the review text contains both a Google machine translation and the reviewer's original wording, follow the original. If the language is unclear, reply in English.

Apologize sincerely without being defensive, briefly acknowledge the specific issue raised, and invite the reviewer to reach out directly to resolve it. Do not make promises about refunds or compensation. Keep it under 80 words. Do not repeat the reviewer's name.`,
  },
];

/** Matches `prompts.tone`'s column default. */
export const DEFAULT_PROMPT_TONE: PromptTone = 'professional';
