/**
 * The one source of truth for password rules on the client, mirroring the backend's
 * `Length(8, 128)` + `PASSWORD_PATTERN` (apps/backend/src/api/auth/constants/auth.constants.ts)
 * one rule at a time.
 *
 * Split into individual rules rather than reusing the backend's single combined regex on purpose:
 * the live checklist has to tell the user *which* rule is unmet, which a pass/fail regex cannot.
 * Both `checkPasswordRequirements` (the checklist) and the zod form schemas consume these, so a
 * password can never show all-green in the UI and then be rejected by the API.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
export const PASSWORD_NUMBER_REGEX = /[0-9]/;
/** Any non-alphanumeric, non-whitespace character — not an allowlist, matching the backend. */
export const PASSWORD_SPECIAL_REGEX = /[^A-Za-z0-9\s]/;
