import { createHash } from 'crypto';

import { TOKEN_HASH_ALGORITHM } from '../constants/auth.constants';

/** SHA-256 hex digest of a raw verify/invite/reset token — see the auth API reference's Security considerations. */
export function hashToken(rawToken: string): string {
  return createHash(TOKEN_HASH_ALGORITHM).update(rawToken).digest('hex');
}
