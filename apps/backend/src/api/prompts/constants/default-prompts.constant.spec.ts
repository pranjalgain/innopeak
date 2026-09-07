import * as fs from 'fs';
import * as path from 'path';

import { DEFAULT_PROMPT_TONE, DEFAULT_PROMPTS } from './default-prompts.constant';
import {
  findMissingRequiredPromptPlaceholders,
  findUnknownPromptPlaceholders,
  PROMPT_TEMPLATE_MAX_LENGTH,
  PROMPT_TONES,
  sanitizePromptTemplate,
} from './prompts.constants';

/**
 * The point of keeping the defaults in TypeScript rather than SQL: they can be held to the same
 * rules `POST /prompts/:id/versions` enforces. A provisioned template that failed validation
 * would be a template the owner cannot re-save without rewriting it from scratch.
 */
describe('DEFAULT_PROMPTS', () => {
  it('covers each category exactly once', () => {
    const categories = DEFAULT_PROMPTS.map(prompt => prompt.category);
    expect([...categories].sort()).toEqual(['escalated', 'neutral', 'positive']);
  });

  it('uses a tone the tone enum actually allows', () => {
    expect(PROMPT_TONES).toContain(DEFAULT_PROMPT_TONE);
  });

  describe.each(DEFAULT_PROMPTS.map(prompt => [prompt.category, prompt] as const))(
    '%s',
    (_category, prompt) => {
      it('contains every required placeholder', () => {
        expect(findMissingRequiredPromptPlaceholders(prompt.template)).toEqual([]);
      });

      it('contains no unknown placeholder', () => {
        expect(findUnknownPromptPlaceholders(prompt.template)).toEqual([]);
      });

      it('fits the column', () => {
        expect(prompt.template.length).toBeLessThanOrEqual(PROMPT_TEMPLATE_MAX_LENGTH);
      });

      it('is already sanitized, so provisioning stores what the validator would accept', () => {
        expect(sanitizePromptTemplate(prompt.template).trim()).toBe(prompt.template);
      });

      it('has owner-facing name and description copy', () => {
        expect(prompt.name.trim()).not.toBe('');
        expect(prompt.description.trim()).not.toBe('');
      });
    }
  );
});

/**
 * `0009_dev_admin_user.sql` creates its owner already `active`, so that tenant never passes
 * through `verifyEmail` and never gets provisioned — the migration therefore carries its own
 * copy of these three templates. Nothing in Postgres or TypeScript ties the two together, so
 * this is the only thing that notices when one is edited and the other is not.
 */
describe('0009_dev_admin_user.sql stays in step with DEFAULT_PROMPTS', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../../db/drizzle/migrations/0009_dev_admin_user.sql'),
    'utf-8'
  );

  /** Undo SQL's doubled-quote escaping, so a literal apostrophe compares equal to the constant. */
  const unescape = (literal: string): string => literal.replace(/''/g, "'");

  /**
   * Parsed per *category*, not as a flat list. An earlier version of this file asserted only that
   * each template appeared somewhere in the migration, which is set membership — swapping the
   * positive and neutral templates into each other's category blocks left every assertion
   * passing, while the dev tenant would have answered 3-star reviews with the warm thank-you copy.
   * These regexes read the category out of the same statement as the value it pairs with, so a
   * mis-pairing fails.
   */
  const promptRows = new Map(
    [
      ...migration.matchAll(
        /INSERT INTO prompts \([^)]*\)\s*SELECT u\.tenant_id, '([a-z]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'([a-z]+)'/g
      ),
    ].map(match => [
      match[1] ?? '',
      {
        name: unescape(match[2] ?? ''),
        description: unescape(match[3] ?? ''),
        tone: match[4] ?? '',
      },
    ])
  );

  // The migration dollar-quotes each template as $t$...$t$ precisely because they contain
  // apostrophes ("the reviewer's name"), which would otherwise need '' escaping.
  const templateRows = new Map(
    [
      ...migration.matchAll(
        /INSERT INTO prompt_versions[\s\S]*?\$t\$([\s\S]*?)\$t\$[\s\S]*?p\.category = '([a-z]+)'/g
      ),
    ].map(match => [match[2] ?? '', (match[1] ?? '').trim()])
  );

  it('carries exactly one prompt and one template per default, with no stale extras', () => {
    expect([...promptRows.keys()].sort()).toEqual(
      DEFAULT_PROMPTS.map(prompt => prompt.category).sort()
    );
    expect([...templateRows.keys()].sort()).toEqual(
      DEFAULT_PROMPTS.map(prompt => prompt.category).sort()
    );
  });

  it('leaves the escalation threshold to its column default rather than restating it', () => {
    // There is deliberately no assertion tying a literal here to one in TypeScript: the product
    // default lives in the schema (0002 / 0010) and both writers inherit it, so there is nothing
    // left to drift. What *would* regress is someone reintroducing an explicit value here.
    const settings = /INSERT INTO tenant_settings \(([^)]*)\)[\s\S]*?SELECT ([^\n]*)/.exec(
      migration
    );
    expect(settings).not.toBeNull();
    expect(settings?.[1]).not.toContain('escalation_rating_threshold');
    // MVP rule: posting to Google is never automatic for a freshly created tenant.
    expect(settings?.[1]).toContain('auto_post_enabled');
    expect(settings?.[2]).toContain('false');
  });

  describe.each(DEFAULT_PROMPTS.map(prompt => [prompt.category, prompt] as const))(
    '%s',
    (category, prompt) => {
      it('template under this category is byte-identical to the constant', () => {
        expect(templateRows.get(category)).toBe(prompt.template.trim());
      });

      it('name, description and tone under this category match the constant', () => {
        expect(promptRows.get(category)).toEqual({
          name: prompt.name,
          description: prompt.description,
          tone: DEFAULT_PROMPT_TONE,
        });
      });
    }
  );
});
