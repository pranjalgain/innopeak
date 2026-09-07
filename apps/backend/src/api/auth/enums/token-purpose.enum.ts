/** `password_reset_tokens.purpose`. Only `VERIFY_EMAIL` is used today — `INVITE`/`RESET` exist in
 * the DB enum for a future invite/reset-password flow, not yet built. */
export enum TokenPurpose {
  VERIFY_EMAIL = 'verify_email',
  INVITE = 'invite',
  RESET = 'reset',
}
