/**
 * Which flow an OTP attempt budget or resend cooldown belongs to. They used to share one counter per address, so an anonymous caller
 * spending the public verify-email budget (10 guesses) also locked the owner out of their own set-password and delete-account codes.
 */
export enum OtpScope {
  /** The public sign-up code, before anyone is signed in: keyed on the submitted email. */
  VERIFY_EMAIL = 'verify-email',
  /** A signed-in tenant user adding a password: keyed on their user id. */
  SET_PASSWORD = 'set-password',
  /** A signed-in SSO-only owner confirming account deletion: keyed on their user id. */
  DELETE_ACCOUNT = 'delete-account',
  /** A signed-in platform admin adding a password: keyed on their admin id. */
  ADMIN_SET_PASSWORD = 'admin-set-password',
}
