/** `platform_admin_invites.purpose`. `RESET` exists on the real enum for a future
 * admin-password-reset flow, not built yet. `SET_PASSWORD` is deliberately distinct from
 * `RESET` for the same reason `TokenPurpose.SET_PASSWORD` is on the tenant side: sharing one
 * value would let a code minted by the authenticated add-password flow be redeemable by that
 * future public route, and vice versa, and would make the one-row-per-(admin, purpose) upsert
 * silently clobber whichever token was issued first. */
export enum PlatformAdminInvitePurpose {
  INVITE = 'invite',
  RESET = 'reset',
  SET_PASSWORD = 'set_password',
}
