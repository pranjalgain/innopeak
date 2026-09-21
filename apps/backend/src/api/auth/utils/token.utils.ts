import { createHash } from 'crypto';

import { TOKEN_HASH_ALGORITHM } from '../constants/auth.constants';

/** SHA-256 hex digest of a raw verify/invite/reset token — see the auth API reference's Security considerations. */
export function hashToken(rawToken: string): string {
  return createHash(TOKEN_HASH_ALGORITHM).update(rawToken).digest('hex');
}

/**
 * The admin set-password OTP's stored digest, bound to the admin it was issued for.
 *
 * These OTPs live in `platform_admin_invites`, whose `token_hash` carries a table-wide UNIQUE
 * index — invite tokens are looked up by token alone, so they have to be globally distinct. A
 * 6-digit OTP has nowhere near the entropy that assumes: two admins holding a pending code would
 * collide on that index and the second `putSetPasswordOtp` would fail on a constraint that is not
 * its upsert target. In development that is not a remote chance but a certainty, since
 * `DEV_VERIFY_EMAIL_TOKEN` deliberately hands every admin the same fixed code.
 *
 * Mixing the admin's id into the digest keeps the stored value unique per admin while leaving the
 * code they actually type a plain 6 digits. `consumeSetPasswordOtp` matches on
 * `(platform_admin_id, token_hash)`, so it always has the id on hand to recompute this.
 */
export function hashAdminSetPasswordOtp(platformAdminId: string, rawOtp: string): string {
  return hashToken(`${platformAdminId}:${rawOtp}`);
}
