/**
 * Shared by the invite email and the Google SSO failure redirects. Path is `/accept-invite/:token`;
 * `/invite/:token` belongs to the platform-admin flow.
 */
export function buildMemberInviteLink(frontendUrl: string | undefined, rawToken: string): string {
  const base = (frontendUrl ?? '').replace(/\/$/, '');
  return `${base}/accept-invite/${rawToken}`;
}
