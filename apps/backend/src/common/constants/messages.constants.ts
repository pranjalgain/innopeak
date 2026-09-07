/**
 * Every user-facing string (exception messages, custom success messages passed to
 * ResponseUtil.success) lives here — see apps/backend/docs/conventions/module-structure.md.
 * Never an inline literal in a controller, service, or DB service.
 */
export const MESSAGES = {
  AUTH: {
    SIGNUP_OTP_SENT: (email: string): string => `Verification code sent to ${email}`,
    LOGIN_OTP_SENT: (email: string): string => `Verification code sent to ${email}`,
    // Deliberately the same message whether or not this email actually matches a
    // pending_verification account — see Security considerations (no enumeration).
    RESEND_OTP_ACK: 'If this account is awaiting verification, a code has been sent.',
    EMAIL_VERIFIED: 'Email verified.',
    EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
    // Deliberately the same message whether the code never existed, was already used, or is
    // expired — see the auth API reference's Security considerations (no enumeration).
    INVALID_OR_EXPIRED_OTP: 'Invalid or expired verification code.',
    // Says "too many attempts" without saying whether the email matches an account — the counter
    // is keyed on the submitted address either way, so this leaks nothing an attacker can use.
    TOO_MANY_OTP_ATTEMPTS:
      'Too many verification attempts. Request a new code and try again shortly.',
    // Deliberately the same message for a wrong password, an unknown email, and an SSO-only
    // account attempting password login — see Security considerations.
    INVALID_CREDENTIALS: 'Invalid email or password.',
    ACCOUNT_DISABLED: 'This account has been disabled.',
    TENANT_SUSPENDED: 'This account is currently suspended.',
    INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token.',
    INVALID_ACCESS_TOKEN: 'Invalid or expired access token.',
    LOGGED_OUT: 'Logged out.',
    // Thrown by @CurrentTenantUser() when a platform-admin token reaches a tenant-scoped route.
    // Says "not available" rather than "you are a platform admin" — the caller already knows what
    // it authenticated as, and naming the token type in the response tells an attacker which
    // half of the token space they landed in.
    TENANT_CONTEXT_REQUIRED: 'This endpoint is not available for this account type.',
  },
  CONNECTIONS: {
    CONNECTION_NOT_FOUND: 'No Google Business Profile connection found for this account.',
    // Deliberately the same message whether the location belongs to no one or to another tenant —
    // a distinct "forbidden" would confirm the id exists somewhere, which is a tenant-enumeration
    // oracle. The status code is 404 in both cases for the same reason.
    LOCATION_NOT_FOUND: 'Location not found.',
    EXTERNAL_LOCATION_NOT_FOUND:
      'That location is not visible to the connected Google account. Reconnect and try again.',
    CONNECTION_NEEDS_REAUTH:
      'The Google connection has expired. Reconnect your Google Business Profile to continue.',
    LOCATION_LIMIT_REACHED: 'This account already has an active location.',
    BACKFILL_ALREADY_RUNNING: 'An import is already running for this location.',
    PROVIDER_UNAVAILABLE: 'Google Business Profile is unavailable right now. Please try again.',
    PROVIDER_NOT_CONFIGURED:
      'Google Business Profile is not configured on this server. Contact support.',
    DISCONNECTED: 'Google Business Profile disconnected.',
    LOCATION_CONFIRMED: 'Location connected. Importing your review history.',
  },
  REVIEWS: {
    REVIEW_NOT_FOUND: 'Review not found.',
  },
  PROMPTS: {
    LISTED: 'Prompts retrieved successfully',
    VERSION_CREATED: 'Prompt version created successfully',
    TONE_UPDATED: 'Prompt tone updated successfully',
    NOT_FOUND: 'Prompt not found',
    TEMPLATE_UNCHANGED: 'Template is identical to the current version',
    VERSION_CONFLICT: 'Another version was saved at the same time — retry after reloading',
    UNKNOWN_VARIABLE: (names: readonly string[]): string =>
      `Unknown prompt placeholder(s): ${names.join(', ')}`,
    MISSING_VARIABLE: (names: readonly string[]): string =>
      `Missing required prompt placeholder(s): ${names.join(', ')}`,
    TENANT_ONLY: 'Prompts are only available to tenant users',
  },
} as const;
