import type { BusinessContact } from './prompt-template.util';

/** Google's cap on a review reply; a longer one is refused by the provider, so it is never auto-posted. */
export const REPLY_MAX_CHARS = 4096;

const TLDS =
  'com|net|org|de|io|co|uk|eu|info|biz|app|shop|me|ly|link|xyz|top|site|online|click|store|dev|ai|tv|us|ch|at|fr|nl|it|es';

const URL_PATTERN = new RegExp(
  String.raw`\b(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:${TLDS})\b(?:\/[^\s]*)?`,
  'gi'
);
/**
 * A sentence break the model wrote without its space ("Besuch.Es war schön"): a bare word, then a capitalised two-letter TLD that is
 * also an everyday word. Kept that narrow on purpose, since anything it lets through can be auto-posted.
 */
const SENTENCE_BREAK_PATTERN = /^[a-z0-9-]*[a-z]\.(?:Es|It|At|Me|Us)$/i;
const SENTENCE_BREAK_CASE = /\.[A-Z][a-z]$/;
const EMAIL_PATTERN = /[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[a-z]{2,}/gi;
/** Day.month.year and the like: eight digits that are not a phone number. */
const DATE_PATTERN = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g;
/** "seit 2010 - 2024": two years and a dash read as eight digits. */
const YEAR_RANGE_PATTERN = /\b(?:19|20)\d{2}\s*[-–]\s*(?:19|20)\d{2}\b/g;
const PHONE_PATTERN = /\+?\d[\d\s().-]{5,}\d/g;
/** Bracketed, braced or angled text a model leaves where it had nothing to put: `[phone]`, `{name}`, `<business>`. */
const PLACEHOLDER_PATTERN = /\[[^\]\n]{1,60}\]|\{\{?[^}\n]{1,60}\}?\}|<[^>\n]{1,60}>/;

const digitsOf = (value: string): string => value.replace(/\D/g, '');

function hostOf(url: string): string | null {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname
      .replace(/^www\./i, '')
      .toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Why a reply must not be published without a person reading it, or `null` when it is clean. The text is derived from a review anyone
 * can write, so a reviewer can try to steer the model into posting a link, a phone number or an offer on the business's own public
 * profile; nothing in the model's own rules is a guarantee. Only the business's own phone number and website (the ones the prompt was
 * given) are allowed to appear. A draft that fails is still saved, for the owner to read and approve or discard.
 */
export function findAutoPostBlocker(
  content: string,
  contact: BusinessContact | null | undefined
): string | null {
  if (content.trim() === '') {
    return 'empty';
  }
  if (content.length > REPLY_MAX_CHARS) {
    return 'too long';
  }
  if (PLACEHOLDER_PATTERN.test(content)) {
    return 'placeholder text';
  }
  if (new RegExp(EMAIL_PATTERN.source, 'i').test(content)) {
    return 'email address';
  }

  const ownHost = contact?.websiteUri ? hostOf(contact.websiteUri) : null;
  for (const match of content.matchAll(URL_PATTERN)) {
    if (SENTENCE_BREAK_PATTERN.test(match[0]) && SENTENCE_BREAK_CASE.test(match[0])) {
      continue;
    }
    const host = hostOf(match[0].replace(/[.,;:!?)]+$/, ''));
    if (host === null || host !== ownHost) {
      return 'link';
    }
  }

  const ownPhone = contact?.phone ? digitsOf(contact.phone) : null;
  for (const match of content
    .replace(DATE_PATTERN, ' ')
    .replace(YEAR_RANGE_PATTERN, ' ')
    .matchAll(PHONE_PATTERN)) {
    const digits = digitsOf(match[0]);
    if (digits.length < 7) {
      continue;
    }
    // The business's own number, with or without its country code or trunk zero: compare the trailing digits they share.
    const shared = ownPhone === null ? 0 : Math.min(9, ownPhone.length, digits.length);
    const isOwn = shared >= 7 && digits.slice(-shared) === ownPhone?.slice(-shared);
    if (!isOwn) {
      return 'phone number';
    }
  }

  return null;
}

const FENCE_TAG = /<\/?review\s*>/gi;

/**
 * The reviewer's words, set apart so the model can tell them from its instructions. Any tag of the same name inside the review is
 * removed first, otherwise a reviewer could close the fence themselves and write instructions after it.
 */
export function fenceReviewText(text: string): string {
  return `<review>\n${text.replace(FENCE_TAG, '')}\n</review>`;
}
