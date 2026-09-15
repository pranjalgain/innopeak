/** `platform_admin_invites.purpose`. Only `INVITE` is used today — `RESET` exists on the real
 * enum for a future admin-password-reset flow, not built yet. */
export enum PlatformAdminInvitePurpose {
  INVITE = 'invite',
  RESET = 'reset',
}
