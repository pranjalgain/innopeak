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
 * `platform_admins` row to activate. See `PlatformAdminAuthService.completeAdminInviteGoogle`.
 *
 * `ADMIN_LOGIN` is the returning half of that: an admin who accepted through Google has no
 * password at all, so Google is their *only* way back in. It resolves against
 * `platform_admin_identities` and nothing else — deliberately not reusing `LOGIN`, which falls
 * through to the tenant tables when no admin matches. Reusing it would have let the admin sign-in
 * screen quietly hand back a *tenant* session to anyone whose Google account happened to have one,
 * and would have sent every failure to the tenant `/login` page, which carries no admin path.
 */
export enum OAuthIntent {
  LOGIN = 'login',
  SIGNUP = 'signup',
  ADMIN_INVITE = 'admin_invite',
  ADMIN_LOGIN = 'admin_login',
}
