/** Machine-facing codes the frontend branches on. Distinct from MESSAGES, which is human copy. */
export const PROMPT_ERROR_CODES = {
  UNKNOWN_PLACEHOLDER: 'UNKNOWN_PLACEHOLDER',
  MISSING_PLACEHOLDER: 'MISSING_PLACEHOLDER',
} as const;

export const REQUIRED_PROMPT_PLACEHOLDERS = [
  'business_name',
  'reviewer_name',
  'rating',
  'review_text',
] as const;

/**
 * Allowed in a template but not required; empty today so an optional variable can be added without
 * invalidating stored templates.
 */
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

/**
 * Runtime companion to `PromptCategory` so a DTO has something to validate against. Keep in sync by
 * hand.
 */
export const PROMPT_CATEGORIES = ['positive', 'neutral', 'escalated'] as const;

export type PromptToneValue = (typeof PROMPT_TONES)[number];

export const PROMPT_VERSION_APPEND_RETRY_LIMIT = 1;

/**
 * A factory, not a shared instance: a `g`-flagged `RegExp` is stateful (`lastIndex`), so one shared
 * instance across modules is a footgun. `fillPromptTemplate` gets its own from here rather than a
 * divergent copy.
 */
export function createPlaceholderPattern(): RegExp {
  return /\{\{([^}]*)\}\}/g;
}

const PLACEHOLDER_PATTERN = createPlaceholderPattern();

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
