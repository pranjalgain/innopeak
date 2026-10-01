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
 * Three layers, because signing alone does not close the attack this route has.
 *
 * **The attack.** A self-contained signed blob is a bearer credential meaning "write a connection
 * into tenant X", and the attacker holds a validly-signed one — for their *own* tenant. They mail
 * that consent URL to a victim business owner. The victim consents, their Google Business Profile
 * is grafted onto the *attacker's* tenant, the backfill imports the victim's entire review
 * history, and the attacker can post public replies as the victim's business. A signature proves
 * we minted the blob. It proves nothing about who is completing the flow.
 *
 * So:
 *
 *  1. **The signed blob is used only to reject garbage cheaply and recover the nonce.** Not one
 *     field the write path acts on is read from it.
 *  2. **A Redis record is authoritative** and holds `tenantId`, `userId`, `returnTo`. Consumed
 *     with `GETDEL` — atomic, so a replayed callback finds nothing — *before* the code is
 *     exchanged. This makes "the blob is a credential" structurally false rather than mitigated.
 *  3. **A `gbp_oauth_sid` cookie binds the flow to the initiating browser**; the record stores only
 *     its SHA-256. This is the layer that actually defeats the attack above: the victim's browser
 *     has no such cookie, the comparison fails, and nothing is written.
 */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);
  private readonly secret: string;

  constructor(
    configService: ConfigService<EnvConfig>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    // Boot in production already refuses without this (env-config.module.ts). The local fallback
    // is a fixed dev string rather than a random per-process one, so a state minted before a
    // hot reload still verifies afterwards.
    this.secret =
      configService.get<string>('GBP_STATE_SECRET') ?? 'insecure-local-gbp-state-secret';
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

    // `NX` so a nonce collision (astronomically unlikely, but free to rule out) fails rather than
    // overwriting someone else's in-flight consent.
    await this.redis.set(
      `${STATE_KEY_PREFIX}${nonce}`,
      JSON.stringify(record),
      'EX',
      OAUTH_STATE_TTL_SECONDS,
      'NX'
    );

    return { state: this.sign(nonce), sid };
  }

  /**
   * Verifies, then consumes. `GETDEL` is what makes the nonce single-use: a replayed callback —
   * the user hitting back, or an attacker resubmitting a captured URL — finds nothing and is
   * rejected, and there is no read-then-delete window for two concurrent callbacks to both pass.
   */
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
      // Expired, already consumed, or never issued — all indistinguishable to the caller by
      // design, and all map to the same INVALID_STATE redirect.
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

  /**
   * Distinguishes a malformed/forged blob from one that's merely past its own TTL pre-filter —
   * both used to collapse into the same `null`, making `OAuthStateFailureReason.EXPIRED`
   * unreachable despite existing as its own enum member. The distinction stays internal (see this
   * class's doc comment: every reason still maps to the same external `INVALID_STATE`), but an
   * internal diagnostic that can never actually fire is worse than no diagnostic at all — it
   * looks like coverage that isn't there.
   */
  private verify(state: string):
    | {
        ok: false;
        reason: OAuthStateFailureReason.EXPIRED | OAuthStateFailureReason.INVALID_SIGNATURE;
      }
    | { ok: true; nonce: string } {
    const parts = state.split('.');
    if (parts.length !== 3) {
      return { ok: false, reason: OAuthStateFailureReason.INVALID_SIGNATURE };
    }

    const [nonce, issuedAt, signature] = parts as [string, string, string];
    const expected = this.hmac(`${nonce}.${issuedAt}`);

    // Constant-time: a plain `===` leaks how many leading bytes matched through timing, which is
    // enough to forge a signature byte by byte given enough attempts.
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return { ok: false, reason: OAuthStateFailureReason.INVALID_SIGNATURE };
    }

    // The Redis record's own TTL is the real expiry; this is a cheap pre-filter that avoids a
    // round trip for a blob that is obviously stale.
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
