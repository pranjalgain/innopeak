import { buildSystemPrompt, fillPromptTemplate } from './prompt-template.util';

describe('fillPromptTemplate', () => {
  it('substitutes every placeholder with its matching value', () => {
    const result = fillPromptTemplate(
      'Hello {{reviewer_name}}, thanks for the {{rating}}-star review of {{business_name}}.',
      { reviewer_name: 'Alex', rating: '5', business_name: 'Acme Cafe' }
    );

    expect(result).toBe('Hello Alex, thanks for the 5-star review of Acme Cafe.');
  });

  it('is case-insensitive on the placeholder name', () => {
    const result = fillPromptTemplate('{{Reviewer_Name}}', { reviewer_name: 'Alex' });
    expect(result).toBe('Alex');
  });

  it('leaves an unrecognized placeholder untouched rather than blanking it', () => {
    const result = fillPromptTemplate('{{reviewer_name}} / {{unknown_field}}', {
      reviewer_name: 'Alex',
    });

    expect(result).toBe('Alex / {{unknown_field}}');
  });

  it('leaves a placeholder untouched when its value is an empty string', () => {
    // `Object.hasOwn` (present) vs the value being falsy — an explicit empty review_text is a
    // real, valid value, not "missing"; only an absent key falls back to the original token.
    const result = fillPromptTemplate('Review: "{{review_text}}"', { review_text: '' });
    expect(result).toBe('Review: ""');
  });

  it('tolerates whitespace padding inside the braces', () => {
    // The shared pattern captures whatever sits between the braces (including padding) and this
    // function trims it, rather than the pattern itself allowing for `\s*`. Worth pinning: an
    // earlier, module-local copy of the regex encoded the padding allowance in the pattern, so
    // this behaviour has to survive being sourced from `createPlaceholderPattern()` instead.
    const result = fillPromptTemplate('{{ business_name }} / {{\treviewer_name\t}}', {
      business_name: 'Acme Cafe',
      reviewer_name: 'Alex',
    });

    expect(result).toBe('Acme Cafe / Alex');
  });

  it('fills consistently across repeated calls despite the shared global regex', () => {
    // `createPlaceholderPattern()` hands out a `g`-flagged RegExp, which carries `lastIndex`
    // state. `String.replace` resets it per call, but this module holds one long-lived instance,
    // so a second call must not start mid-string and silently skip the first placeholder.
    const template = '{{business_name}} thanks {{reviewer_name}}';
    const values = { business_name: 'Acme', reviewer_name: 'Alex' };

    expect(fillPromptTemplate(template, values)).toBe('Acme thanks Alex');
    expect(fillPromptTemplate(template, values)).toBe('Acme thanks Alex');
    expect(fillPromptTemplate(template, values)).toBe('Acme thanks Alex');
  });

  it('replaces every occurrence of a repeated placeholder', () => {
    const result = fillPromptTemplate('{{business_name}} loves you, {{business_name}}!', {
      business_name: 'Acme',
    });

    expect(result).toBe('Acme loves you, Acme!');
  });
});

describe('buildSystemPrompt', () => {
  it('embeds the requested tone', () => {
    expect(buildSystemPrompt('friendly')).toContain('friendly tone');
    expect(buildSystemPrompt('formal')).toContain('formal tone');
  });

  it('instructs the model to output only the reply text', () => {
    const prompt = buildSystemPrompt('professional');
    expect(prompt).toContain('no preamble');
    expect(prompt).toContain('no markdown formatting');
  });
});
