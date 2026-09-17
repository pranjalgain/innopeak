/**
 * Builds the web app's tenant-member invite-accept URL for a raw invite token — shared by
 * `TenantMembersService.sendInvite` (the emailed/dev-logged link) and `AuthService` (the
 * failure-redirect targets for the Google SSO accept branch), so the two never drift on the path
 * shape. Mirrors `buildAdminInviteLink`; deliberately a different path (`/accept-invite/:token`,
 * not `/invite/:token`) since that one already belongs to the platform-admin flow.
 */
export function buildMemberInviteLink(frontendUrl: string | undefined, rawToken: string): string {
  const base = (frontendUrl ?? '').replace(/\/$/, '');
  return `${base}/accept-invite/${rawToken}`;
}
