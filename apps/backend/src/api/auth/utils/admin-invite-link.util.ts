/**
 * Shared by the invite email and the Google SSO failure redirects so the path shape never drifts.
 */
export function buildAdminInviteLink(frontendUrl: string | undefined, rawToken: string): string {
  const base = (frontendUrl ?? '').replace(/\/$/, '');
  return `${base}/invite/${rawToken}`;
}
