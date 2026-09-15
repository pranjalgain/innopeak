import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import { randomBytes } from 'crypto';

import {
  GOOGLE_PENDING_SIGNUP_KEY_PREFIX,
  GOOGLE_PENDING_SIGNUP_TTL_SECONDS,
} from '../constants/google-auth.constants';

/** A Google identity Google has verified, but that has no tenant yet — see the class doc below. */
export interface PendingGoogleSignupIdentity {
  providerUserId: string;
  email: string;
  name: string | null;
}

export type ConsumePendingGoogleSignupResult =
  { ok: false } | { ok: true; identity: PendingGoogleSignupIdentity };

/**
 * Bridges the gap between "the Google callback resolved a genuinely new person" and "we know what
 * to call their tenant" — `tenants.name` is NOT NULL and Google returns a person, not a business,
 * so the callback can no longer create the tenant on the spot the way it used to when `businessName`
 * arrived with the original OAuth state.
 *
 * One Redis-backed record, single-use (`GETDEL`), the same shape as `GoogleOAuthStateService` but
 * simpler: there is no separate browser-binding cookie here, because there is nothing for one to
 * defend against. `GoogleOAuthStateService`'s `google_auth_sid` cookie exists because its `state`
 * travels through a URL Google echoes back — a value an attacker could mail to a victim. This
 * nonce is never round-tripped through any channel but an httpOnly cookie this server set and only
 * the originating browser holds, so it cannot be mailed anywhere; a high-entropy, single-use,
 * short-TTL value is exactly the security model the `refresh_token` cookie already relies on.
 */
@Injectable()
export class PendingGoogleSignupService {
  private readonly logger = new Logger(PendingGoogleSignupService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Returns the nonce — the caller sets it as the `google_pending_signup` cookie. */
  async mint(identity: PendingGoogleSignupIdentity): Promise<string> {
    const nonce = randomBytes(32).toString('base64url');

    // `NX` so a nonce collision fails rather than overwriting another in-flight signup. The
    // result is checked rather than assumed — see `GoogleOAuthStateService.mint` for why a
    // silent overwrite-miss here would otherwise surface only as a later, generic consume
    // failure with no diagnostic trail. At 256 bits of randomness this is not a realistic
    // collision — the check exists so the impossible case fails loudly instead of silently.
    const claimed = await this.redis.set(
      `${GOOGLE_PENDING_SIGNUP_KEY_PREFIX}${nonce}`,
      JSON.stringify(identity),
      'EX',
      GOOGLE_PENDING_SIGNUP_TTL_SECONDS,
      'NX'
    );

    if (claimed !== 'OK') {
      this.logger.error('Pending Google signup nonce collision on mint');
      throw new Error('Failed to mint pending Google signup record: nonce collision');
    }

    return nonce;
  }

  async consume(nonce: string | undefined): Promise<ConsumePendingGoogleSignupResult> {
    if (nonce === undefined || nonce === '') {
      return { ok: false };
    }

    const raw = await this.redis.getdel(`${GOOGLE_PENDING_SIGNUP_KEY_PREFIX}${nonce}`);
    if (raw === null) {
      return { ok: false };
    }

    return { ok: true, identity: JSON.parse(raw) as PendingGoogleSignupIdentity };
  }
}
