export const REQUIRED_PROMPT_PLACEHOLDERS = [
  'business_name',
  'reviewer_name',
  'rating',
  'review_text',
] as const;

/** Names that may appear in a template but are not required. Empty today so a later
 *  optional variable can be added without invalidating stored templates. */
export const OPTIONAL_PROMPT_PLACEHOLDERS = [] as const;

export const PROMPT_PLACEHOLDER_ALLOWLIST = [
  ...REQUIRED_PROMPT_PLACEHOLDERS,
  ...OPTIONAL_PROMPT_PLACEHOLDERS,
] as const;

export type PromptPlaceholderName = (typeof PROMPT_PLACEHOLDER_ALLOWLIST)[number];

export const PROMPT_TEMPLATE_MAX_LENGTH = 1000;

export const PROMPT_TONES = [
  'friendly',
  'professional',
  'formal',
  'playful',
  'empathetic',
] as const;

export type PromptToneValue = (typeof PROMPT_TONES)[number];

export const PROMPT_VERSION_APPEND_RETRY_LIMIT = 1;

const PLACEHOLDER_PATTERN = /\{\{([^}]*)\}\}/g;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const ZERO_WIDTH_AND_BIDI = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function sanitizePromptTemplate(template: string): string {
  return template
    .normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(CONTROL_CHARS, '')
    .replace(ZERO_WIDTH_AND_BIDI, '');
}

function collectPlaceholderNames(template: string): Set<string> {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1]?.trim().toLowerCase();
    if (name !== undefined && name.length > 0) {
      names.add(name);
    }
  }
  return names;
}

export function findUnknownPromptPlaceholders(template: string): string[] {
  const allow = new Set<string>(PROMPT_PLACEHOLDER_ALLOWLIST);
  const unknown: string[] = [];

  for (const name of collectPlaceholderNames(template)) {
    if (!allow.has(name)) {
      unknown.push(name);
    }
  }

  return unknown.sort();
}

export function findMissingRequiredPromptPlaceholders(template: string): string[] {
  const present = collectPlaceholderNames(template);
  return REQUIRED_PROMPT_PLACEHOLDERS.filter(name => !present.has(name));
}
