/**
 * Which button started a Google round trip, carried in the signed `state` because the callback is
 * a single route. Only the signup path may create a tenant; a login that matches no identity is a
 * dead end (`NO_ACCOUNT`), not a silent signup.
 *
 * `ADMIN_INVITE` and `INVITE` link Google for the first time (no identity row exists yet) and carry
 * `inviteToken` in the state; they redeem different rows (`platform_admins` vs `users`).
 *
 * `ADMIN_LOGIN` resolves against `platform_admin_identities` only. Reusing `LOGIN` would fall
 * through to the tenant tables and hand a tenant session to the admin sign-in screen.
 */
export enum OAuthIntent {
  LOGIN = 'login',
  SIGNUP = 'signup',
  ADMIN_INVITE = 'admin_invite',
  ADMIN_LOGIN = 'admin_login',
  INVITE = 'invite',
}
