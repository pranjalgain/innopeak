import { isLocalDevelopment } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { OAUTH_STATE_TTL_SECONDS } from '../constants/connections.constants';
import { OAuthStateFailureReason } from '../enums/oauth-state-failure-reason.enum';
import { ReturnTo } from '../enums/return-to.enum';
import type { ConsumeResult, MintedState, OAuthStateRecord } from '../types/connections.type';

const STATE_KEY_PREFIX = 'connections:oauth-state:';

/**
 * Signing alone does not stop an attacker mailing a victim a validly signed consent URL for the
 * attacker's own tenant, which would graft the victim's Google Business Profile onto it. So:
 *
 *  1. The signed blob only rejects garbage cheaply and recovers the nonce; nothing the write path
 *     acts on is read from it.
 *  2. A Redis record is authoritative (`tenantId`, `userId`, `returnTo`), consumed with `GETDEL`
 *     before the code is exchanged.
 *  3. A `gbp_oauth_sid` cookie binds the flow to the initiating browser (the record stores only its
 *     SHA-256), which is what defeats the attack: the victim's browser has no such cookie.
 */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);
  private readonly secret: string;

  constructor(
    configService: ConfigService<EnvConfig>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    // Production already refuses to boot without this; the fixed dev string keeps a state minted before a hot reload verifiable on a
    // laptop. Not `isProduction()`: a staging box runs as `development`, and a signing key public in this repository must not sign there.
    const configured = configService.get<string>('GBP_STATE_SECRET');
    if (!configured && !isLocalDevelopment()) {
      throw new Error('GBP_STATE_SECRET must be set unless the app runs only on a local machine.');
    }
    this.secret = configured ?? 'insecure-local-gbp-state-secret';
  }

  async mint(input: {
    tenantId: string;
    userId: string;
    returnTo: ReturnTo;
  }): Promise<MintedState> {
    const nonce = randomBytes(24).toString('base64url');
    const sid = randomBytes(32).toString('base64url');

    const record: OAuthStateRecord = {
      tenantId: input.tenantId,
      userId: input.userId,
      returnTo: input.returnTo,
      sidHash: this.hashSid(sid),
    };

    // `NX` so a nonce collision fails rather than overwriting someone else's in-flight consent.
    await this.redis.set(
      `${STATE_KEY_PREFIX}${nonce}`,
      JSON.stringify(record),
      'EX',
      OAUTH_STATE_TTL_SECONDS,
      'NX'
    );

    return { state: this.sign(nonce), sid };
  }

  /** `GETDEL` makes the nonce single-use with no read-then-delete window for concurrent callbacks. */
  async consume(state: string | undefined, sid: string | undefined): Promise<ConsumeResult> {
    if (!state) {
      return { ok: false, reason: OAuthStateFailureReason.INVALID_SIGNATURE };
    }

    const verified = this.verify(state);
    if (!verified.ok) {
      this.logger.warn(`OAuth state rejected before Redis lookup: ${verified.reason}`);
      return { ok: false, reason: verified.reason };
    }
    const nonce = verified.nonce;

    const raw = await this.redis.getdel(`${STATE_KEY_PREFIX}${nonce}`);
    if (!raw) {
      // Expired, consumed or never issued: indistinguishable to the caller and all map to INVALID_STATE.
      return { ok: false, reason: OAuthStateFailureReason.UNKNOWN_NONCE };
    }

    const record = JSON.parse(raw) as OAuthStateRecord;

    if (!sid || !this.sidMatches(sid, record.sidHash)) {
      this.logger.warn(
        `OAuth callback for tenant ${record.tenantId} rejected: browser-binding cookie missing or mismatched. This is the expected outcome of a mailed consent link.`
      );
      return { ok: false, reason: OAuthStateFailureReason.SID_MISMATCH };
    }

    return { ok: true, record };
  }

  private sign(nonce: string): string {
    const issuedAt = Date.now().toString();
    const payload = `${nonce}.${issuedAt}`;
    return `${payload}.${this.hmac(payload)}`;
  }

  /** Separates a forged blob from one merely past its TTL pre-filter, so `EXPIRED` is reachable; still internal (all reasons map to `INVALID_STATE`). */
  private verify(state: string):
    | {
        ok: false;
        reason: OAuthStateFailureReason.EXPIRED | OAuthStateFailureReason.INVALID_SIGNATURE;
      }
    | { ok: true; nonce: string } {
    // A repeated query key reaches here as an array whatever the type says; `.split` on it threw a 500.
    if (typeof state !== 'string') {
      return { ok: false, reason: OAuthStateFailureReason.INVALID_SIGNATURE };
    }
    const parts = state.split('.');
    if (parts.length !== 3) {
      return { ok: false, reason: OAuthStateFailureReason.INVALID_SIGNATURE };
    }

    const [nonce, issuedAt, signature] = parts as [string, string, string];
    const expected = this.hmac(`${nonce}.${issuedAt}`);

    // Constant-time: `===` leaks matching prefix length through timing.
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { ok: false, reason: OAuthStateFailureReason.INVALID_SIGNATURE };
    }

    // Redis TTL is the real expiry; this just avoids a round trip for an obviously stale blob.
    if (Date.now() - Number(issuedAt) > OAUTH_STATE_TTL_SECONDS * 1000) {
      return { ok: false, reason: OAuthStateFailureReason.EXPIRED };
    }

    return { ok: true, nonce };
  }

  private hmac(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  /** Only the hash is persisted, so a Redis dump does not hand out live session bindings. */
  private hashSid(sid: string): string {
    return createHash('sha256').update(sid).digest('base64url');
  }

  private sidMatches(sid: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashSid(sid));
    const expected = Buffer.from(expectedHash);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
