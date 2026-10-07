/**
 * Mirrors the backend's `Length(8, 128)` + `PASSWORD_PATTERN`
 * (apps/backend/src/api/auth/constants/auth.constants.ts) one rule at a time, so the live checklist
 * can say which rule is unmet (a combined regex cannot). The checklist and the zod schemas both
 * consume these, so a password cannot show all-green and then be rejected by the API.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_NUMBER_REGEX = /[0-9]/;
/** Any non-alphanumeric, non-whitespace character — not an allowlist, matching the backend. */
export const PASSWORD_SPECIAL_REGEX = /[^A-Za-z0-9\s]/;
