/**
 * Which button started a Google round trip. Carried inside the signed `state` because the callback
 * is a single route and cannot otherwise tell them apart — and the difference is load-bearing:
 * only the signup path may create a tenant, and only it carries the business name needed to do so.
 *
 * A login-intent round trip that resolves to no known identity is therefore a dead end by design
 * (`NO_ACCOUNT`), not a silent signup with a fabricated business name.
 *
 * `ADMIN_INVITE` is the third, structurally distinct branch: it never looks up an existing
 * `platform_admin_identities` row (there isn't one yet — this is the first time this admin links
 * Google) and it carries `inviteToken` in the state record so the callback knows which invited
 * `platform_admins` row to activate. See `AuthService.completeAdminInviteGoogle`.
 */
export enum OAuthIntent {
  LOGIN = 'login',
  SIGNUP = 'signup',
  ADMIN_INVITE = 'admin_invite',
}
