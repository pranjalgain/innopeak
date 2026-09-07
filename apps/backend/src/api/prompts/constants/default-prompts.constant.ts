import type { PromptCategory, PromptTone } from '../types/prompt.type';

export interface DefaultPrompt {
  category: PromptCategory;
  name: string;
  description: string;
  /** The v1 template. Must satisfy `findMissingRequiredPromptPlaceholders` — there is a test for it. */
  template: string;
}

/**
 * What every new tenant starts with, written into `prompts` + `prompt_versions` inside the
 * email-verification transaction (`AuthDbService.provisionTenantWorkspace`) — not at signup, since
 * a `pending_verification` tenant may never activate.
 *
 * Deliberately a TypeScript constant rather than a migration. A migration runs once against a
 * database, so a tenant created afterwards would get nothing — which is exactly the gap this
 * closes. Keeping the copy here also means changing a default is an ordinary reviewable code
 * change, and the templates can be type-checked and tested against the placeholder allowlist,
 * which a SQL string literal never can be.
 *
 * `src/db/drizzle/migrations/0009_dev_admin_user.sql` carries the same three templates, because
 * the dev owner it creates is already `active` and so never reaches `verifyEmail`. Keep the two
 * in step — `default-prompts.constant.spec.ts` fails if they drift.
 */
export const DEFAULT_PROMPTS: readonly DefaultPrompt[] = [
  {
    category: 'positive',
    name: 'Positive review reply',
    description:
      'Used for 4-5 star reviews. Keep it warm and specific to what the reviewer praised.',
    template: `You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Write a warm, genuine thank-you reply. Mention something specific from the review if possible. Keep it under 60 words and avoid generic phrases like "we appreciate your feedback." Do not repeat the reviewer's name.`,
  },
  {
    category: 'neutral',
    name: 'Neutral review reply',
    description: 'Used for 3-star reviews with mixed feedback.',
    template: `You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Acknowledge both the positive and constructive points in the review. Invite the reviewer to give the business another visit. Keep it under 70 words. Do not repeat the reviewer's name.`,
  },
  {
    category: 'escalated',
    name: 'Negative / escalated review reply',
    description: 'Used for 1-2 star reviews and reviews escalated to the team.',
    template: `You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.

Review: "{{review_text}}"

Apologize sincerely without being defensive, briefly acknowledge the specific issue raised, and invite the reviewer to reach out directly to resolve it. Do not make promises about refunds or compensation. Keep it under 80 words. Do not repeat the reviewer's name.`,
  },
];

/** The tone every provisioned prompt starts on — matches `prompts.tone`'s own column default. */
export const DEFAULT_PROMPT_TONE: PromptTone = 'professional';
