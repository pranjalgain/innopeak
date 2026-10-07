import {
  buildSystemPrompt,
  fillPromptTemplate,
  parseMultiSnippetReplies,
} from './prompt-template.util';

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
    // An empty value is valid, not "missing"; only an absent key keeps the token.
    const result = fillPromptTemplate('Review: "{{review_text}}"', { review_text: '' });
    expect(result).toBe('Review: ""');
  });

  it('tolerates whitespace padding inside the braces', () => {
    // The shared pattern captures the padding; the function must trim it.
    const result = fillPromptTemplate('{{ business_name }} / {{\treviewer_name\t}}', {
      business_name: 'Acme Cafe',
      reviewer_name: 'Alex',
    });

    expect(result).toBe('Acme Cafe / Alex');
  });

  it('fills consistently across repeated calls despite the shared global regex', () => {
    // Guards the long-lived `g`-flagged RegExp: a later call must not start at a stale `lastIndex`.
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

  it('defaults to the single-reply instruction when snippetCount is omitted', () => {
    expect(buildSystemPrompt('professional')).not.toContain('JSON array');
  });

  it('switches to the JSON-array, explicitly-distinct instruction for snippetCount > 1', () => {
    const prompt = buildSystemPrompt('professional', 3);
    expect(prompt).toContain('exactly 3 distinct reply options');
    expect(prompt).toContain('differ meaningfully from one another');
    expect(prompt).toContain('JSON array of exactly 3 strings');
  });
});

describe('parseMultiSnippetReplies', () => {
  it('parses a clean JSON array of the expected length', () => {
    const result = parseMultiSnippetReplies(
      JSON.stringify(['Option A', 'Option B', 'Option C']),
      3
    );
    expect(result).toEqual(['Option A', 'Option B', 'Option C']);
  });

  it('tolerates a ```json fenced code block around the array', () => {
    const fenced = '```json\n["Option A", "Option B"]\n```';
    expect(parseMultiSnippetReplies(fenced, 2)).toEqual(['Option A', 'Option B']);
  });

  it('trims whitespace off each entry', () => {
    const result = parseMultiSnippetReplies(JSON.stringify(['  Option A  ', 'Option B']), 2);
    expect(result).toEqual(['Option A', 'Option B']);
  });

  it('returns null for non-JSON content', () => {
    expect(parseMultiSnippetReplies('Sure, here you go: 1. Thanks! 2. Appreciated!', 2)).toBeNull();
  });

  it('returns null when the array length does not match expectedCount', () => {
    expect(parseMultiSnippetReplies(JSON.stringify(['Only one']), 2)).toBeNull();
  });

  it('returns null for a JSON value that is not an array', () => {
    expect(parseMultiSnippetReplies(JSON.stringify({ reply: 'Option A' }), 1)).toBeNull();
  });

  it('returns null when an entry is blank or not a string', () => {
    expect(parseMultiSnippetReplies(JSON.stringify(['Option A', '   ']), 2)).toBeNull();
    expect(parseMultiSnippetReplies(JSON.stringify(['Option A', 42]), 2)).toBeNull();
  });
});
