/**
 * `password_reset_tokens.purpose`.
 *
 * `VERIFY_EMAIL` (signup/login OTP) and `SET_PASSWORD` (the step-up OTP a Google-only account
 * must clear before it can adopt a password — see `AuthService.requestSetPasswordOtp`) are the
 * two in use today. `INVITE`/`RESET` exist in the DB enum for a future invite/forgot-password
 * flow, not yet built.
 *
 * `SET_PASSWORD` is deliberately its own member rather than reusing `RESET`, which the auth API
 * reference reserves for the public forgot-password route. One shared value would mean the
 * `(user_id, purpose)` upsert silently invalidates whichever token was issued first, and — worse
 * — that a code minted by the *authenticated* set-password flow would satisfy a consume from the
 * *unauthenticated* reset route, and vice versa.
 */
export enum TokenPurpose {
  VERIFY_EMAIL = 'verify_email',
  INVITE = 'invite',
  RESET = 'reset',
  SET_PASSWORD = 'set_password',
}
