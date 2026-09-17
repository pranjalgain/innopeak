/**
 * What starting a Google OAuth round trip produces — shared by `AuthService.buildGoogleAuthorizeRedirect`
 * (tenant login/signup) and `PlatformAdminAuthService.buildAdminInviteGoogleRedirect` (admin
 * invite acceptance), so both controllers redirect either way with the same shape rather than
 * throwing for an expected failure — the browser navigated here directly, so an exception
 * filter's JSON body would paint as a document.
 */
export type GoogleAuthorizeRedirect =
  { ok: false; redirectUrl: string } | { ok: true; authorizationUrl: string; sid: string };
