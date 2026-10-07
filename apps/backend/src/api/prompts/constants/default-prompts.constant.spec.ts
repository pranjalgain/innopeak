import { DEFAULT_PROMPT_TONE, DEFAULT_PROMPTS } from './default-prompts.constant';
import {
  findMissingRequiredPromptPlaceholders,
  findUnknownPromptPlaceholders,
  PROMPT_TEMPLATE_MAX_LENGTH,
  PROMPT_TONES,
  sanitizePromptTemplate,
} from './prompts.constants';

/**
 * Defaults are TypeScript rather than SQL so they are held to the same rules as `POST
 * /prompts/:id/versions`; a template failing them could not be re-saved.
 */
describe('DEFAULT_PROMPTS', () => {
  it('covers each category exactly once', () => {
    const categories = DEFAULT_PROMPTS.map(prompt => prompt.category);
    expect([...categories].sort()).toEqual(['escalated', 'neutral', 'positive']);
  });

  it('uses a tone the tone enum actually allows', () => {
    expect(PROMPT_TONES).toContain(DEFAULT_PROMPT_TONE);
  });

  /**
   * Reply-language behaviour lives in the template text, not a wrapper, so every default must carry
   * it; otherwise a German reviewer getting an English reply goes unnoticed.
   */
  it('every default tells the model to answer in the language the review was written in', () => {
    for (const prompt of DEFAULT_PROMPTS) {
      expect(prompt.template).toContain('Reply in the same language the review is written in.');
      // Google can return a machine translation and the reviewer's own words in one string; the
      // original is the one that says what language they actually wrote in.
      expect(prompt.template).toContain('follow the original');
    }
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
