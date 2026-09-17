/**
 * Builds the web app's admin-invite-accept URL for a raw invite token — shared by
 * `AdminSettingsService.sendInvite` (the emailed/dev-logged link) and `AuthService`
 * (the failure-redirect targets for the Google SSO accept branch), so the two never drift on the
 * path shape. Mirrors `ConnectionsService`'s own `FRONTEND_URL` trim.
 */
export function buildAdminInviteLink(frontendUrl: string | undefined, rawToken: string): string {
  const base = (frontendUrl ?? '').replace(/\/$/, '');
  return `${base}/invite/${rawToken}`;
}
