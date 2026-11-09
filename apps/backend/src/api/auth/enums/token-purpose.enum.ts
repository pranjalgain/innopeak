/**
 * `user_auth_tokens.purpose`. `INVITE`/`RESET` are reserved for flows not yet built.
 *
 * `SET_PASSWORD` is separate from `RESET` (the public forgot-password route): sharing a value
 * would let the `(user_id, purpose)` upsert invalidate the other token, and a code minted by the
 * authenticated flow would satisfy the unauthenticated route.
 */
export enum TokenPurpose {
  VERIFY_EMAIL = 'verify_email',
  INVITE = 'invite',
  RESET = 'reset',
  SET_PASSWORD = 'set_password',
  DELETE_ACCOUNT = 'delete_account',
}
