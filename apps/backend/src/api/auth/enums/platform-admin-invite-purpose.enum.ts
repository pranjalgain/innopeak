/**
 * `platform_admin_invites.purpose`. `RESET` is reserved for a future flow. `SET_PASSWORD` is
 * distinct from it so codes are not redeemable across routes and the one-row-per-(admin, purpose)
 * upsert does not clobber the other token.
 */
export enum PlatformAdminInvitePurpose {
  INVITE = 'invite',
  RESET = 'reset',
  SET_PASSWORD = 'set_password',
}
