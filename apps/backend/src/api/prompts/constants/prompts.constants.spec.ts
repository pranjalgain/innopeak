import {
  findMissingRequiredPromptPlaceholders,
  findUnknownPromptPlaceholders,
  sanitizePromptTemplate,
} from './prompts.constants';

describe('findUnknownPromptPlaceholders', () => {
  it('returns nothing for allowed placeholders', () => {
    const template = 'Hello {{business_name}} {{reviewer_name}} {{rating}} {{review_text}}';
    expect(findUnknownPromptPlaceholders(template)).toEqual([]);
  });

  it('accepts inner whitespace after trim/lowercase', () => {
    const template = 'Hello {{ business_name }} {{ Reviewer_Name }} {{rating}} {{  review_text  }}';
    expect(findUnknownPromptPlaceholders(template)).toEqual([]);
  });

  it('treats camelCase as unknown instead of ignoring it', () => {
    expect(findUnknownPromptPlaceholders('Use {{businessName}}')).toEqual(['businessname']);
  });

  it('returns sorted unique unknown names', () => {
    const template = 'Use {{foo}} and {{business_name}} and {{foo}} and {{bar_baz}}';
    expect(findUnknownPromptPlaceholders(template)).toEqual(['bar_baz', 'foo']);
  });

  it('ignores empty templates', () => {
    expect(findUnknownPromptPlaceholders('')).toEqual([]);
  });
});

describe('findMissingRequiredPromptPlaceholders', () => {
  it('returns nothing when every required name is present', () => {
    const template = '{{business_name}} {{reviewer_name}} {{rating}} {{review_text}}';
    expect(findMissingRequiredPromptPlaceholders(template)).toEqual([]);
  });

  it('names each missing required variable', () => {
    expect(findMissingRequiredPromptPlaceholders('Only {{business_name}}')).toEqual([
      'reviewer_name',
      'rating',
      'review_text',
    ]);
  });

  it('counts spaced names as present', () => {
    const template = '{{ business_name }} {{reviewer_name}} {{rating}} {{review_text}}';
    expect(findMissingRequiredPromptPlaceholders(template)).toEqual([]);
  });
});

describe('sanitizePromptTemplate', () => {
  it('strips null bytes', () => {
    expect(sanitizePromptTemplate('hello\u0000world')).toBe('helloworld');
  });

  it('strips other control characters but keeps newlines', () => {
    expect(sanitizePromptTemplate('a\u0007b\nc\u001bd')).toBe('ab\ncd');
  });

  it('normalizes CRLF and bare CR to LF', () => {
    expect(sanitizePromptTemplate('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('strips zero-width and bidi characters', () => {
    expect(sanitizePromptTemplate('a\u200Bb\u202Ec\uFEFFd')).toBe('abcd');
  });

  it('normalizes to NFC', () => {
    const decomposed = 'cafe\u0301';
    expect(sanitizePromptTemplate(decomposed)).toBe('café');
  });

  it('does not HTML-escape LLM input', () => {
    expect(sanitizePromptTemplate('Use <em> and & and "quotes"')).toBe(
      'Use <em> and & and "quotes"'
    );
  });
});
