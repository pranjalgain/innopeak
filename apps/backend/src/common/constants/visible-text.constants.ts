/**
 * At least one character that is neither whitespace nor invisible (zero-width, format, filler
 * letters). `@IsNotEmpty()` alone accepts `"\u200b"`, which let blank replies be posted and
 * zero-width blocklist terms be saved.
 */
export const HAS_VISIBLE_TEXT = /[^\p{White_Space}\p{Cf}\u115F\u1160\u3164\uFFA0\u2800]/u;

export const REPLY_NEEDS_TEXT_MESSAGE = 'The reply must contain some text.';

export const TERM_NEEDS_TEXT_MESSAGE = 'term must contain some text';
