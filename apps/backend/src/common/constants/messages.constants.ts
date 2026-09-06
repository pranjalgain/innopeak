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
  },
} as const;
