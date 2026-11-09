import { createHash } from 'crypto';

import { TOKEN_HASH_ALGORITHM } from '../constants/auth.constants';

/** SHA-256 hex digest of a raw verify/invite/reset token. */
export function hashToken(rawToken: string): string {
  return createHash(TOKEN_HASH_ALGORITHM).update(rawToken).digest('hex');
}

/**
 * Bound to the admin id because `platform_admin_auth_tokens.token_hash` is table-wide UNIQUE and a
 * 6-digit OTP collides across admins (always in dev, with its fixed code). `consumeSetPasswordOtp`
 * recomputes it from `(platform_admin_id, token_hash)`.
 */
export function hashAdminSetPasswordOtp(platformAdminId: string, rawOtp: string): string {
  return hashToken(`${platformAdminId}:${rawOtp}`);
}
