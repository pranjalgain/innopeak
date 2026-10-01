import { EnvConfig } from '@config/env.config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

import {
  GOOGLE_AUTH_STATE_KEY_PREFIX,
  GOOGLE_AUTH_STATE_TTL_SECONDS,
} from '../constants/google-auth.constants';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import type {
  ConsumeGoogleStateResult,
  GoogleAuthStateRecord,
  MintedGoogleState,
} from '../types/auth.type';

/**
 * Same three layers as the Business Profile flow (`connections/services/oauth-state.service.ts`),
 * for the same structural reason: a self-contained signed blob is a bearer credential, and a
 * signature proves only that we minted it — never who is completing the round trip.
 *
 * Here the blob would assert "sign someone in as intent X". So:
 *
 *  1. **The signed blob only rejects garbage cheaply and recovers the nonce.** No field the write
 *     path acts on is read from it.
 *  2. **A Redis record is authoritative**, consumed with `GETDEL` before the code is exchanged, so
 *     a replayed callback finds nothing and two concurrent ones cannot both pass.
 *  3. **A `google_auth_sid` cookie binds the round trip to the browser that began it**, defeating
 *     a mailed consent link: the recipient's browser has no matching cookie.
 *
 * A genuinely new signup no longer carries a `businessName` here at all — see
 * PendingGoogleSignupService, which takes over once this state is consumed.
 */
@Injectable()
export class GoogleOAuthStateService {
  private readonly logger = new Logger(GoogleOAuthStateService.name);
  private readonly secret: string;

  constructor(
    configService: ConfigService<EnvConfig>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    // A fixed local fallback rather than a random per-process one, so a state minted before a hot
    // reload still verifies after it.
    this.secret =
      configService.get<string>('GOOGLE_AUTH_STATE_SECRET') ??
      configService.get<string>('JWT_SECRET') ??
      'insecure-local-google-auth-state-secret';
  }

  async mint(input: { intent: OAuthIntent; inviteToken?: string }): Promise<MintedGoogleState> {
    const nonce = randomBytes(24).toString('base64url');
    const sid = randomBytes(32).toString('base64url');

    // `exactOptionalPropertyTypes`: built conditionally rather than `inviteToken: input.inviteToken`,
    // which would assign a literal `undefined` for every LOGIN/SIGNUP mint — a real key on the
    // record, not merely an absent one, and a type error under this config regardless.
    const record: GoogleAuthStateRecord = {
      intent: input.intent,
      sidHash: this.hashSid(sid),
      ...(input.inviteToken !== undefined ? { inviteToken: input.inviteToken } : {}),
    };

    // `NX` so a nonce collision fails rather than overwriting another in-flight consent. The
    // result is checked rather than assumed: a silent overwrite-miss here would still sign and
    // return a state whose Redis record is someone else's, so `consume()` would later fail with a
    // generic INVALID_STATE and no way to tell that apart from a genuinely expired or forged one.
    // At 192 bits of randomness this is not a realistic collision — the check exists so the
    // impossible case fails loudly instead of silently, not because it is expected to fire.
    const claimed = await this.redis.set(
      `${GOOGLE_AUTH_STATE_KEY_PREFIX}${nonce}`,
      JSON.stringify(record),
      'EX',
      GOOGLE_AUTH_STATE_TTL_SECONDS,
      'NX'
    );

    if (claimed !== 'OK') {
      this.logger.error(`OAuth state nonce collision on mint (intent: ${input.intent})`);
      throw new Error('Failed to mint OAuth state: nonce collision');
    }

    return { state: this.sign(nonce), sid };
  }

  /**
   * Verifies, then consumes. Every failure returns the same `{ ok: false }` — expired, replayed,
   * forged and wrong-browser are deliberately indistinguishable to the caller, which maps them all
   * to one `INVALID_STATE` redirect.
   */
  async consume(
    state: string | undefined,
    sid: string | undefined
  ): Promise<ConsumeGoogleStateResult> {
    if (state === undefined || state === '') {
      return { ok: false };
    }

    const nonce = this.verify(state);
    if (nonce === null) {
      return { ok: false };
    }

    const raw = await this.redis.getdel(`${GOOGLE_AUTH_STATE_KEY_PREFIX}${nonce}`);
    if (raw === null) {
      return { ok: false };
    }

    const record = JSON.parse(raw) as GoogleAuthStateRecord;

    if (sid === undefined || !this.sidMatches(sid, record.sidHash)) {
      this.logger.warn(
        'Google auth callback rejected: browser-binding cookie missing or mismatched. This is the expected outcome of a mailed consent link.'
      );
      return { ok: false };
    }

    return { ok: true, record };
  }

  private sign(nonce: string): string {
    const issuedAt = Date.now().toString();
    const payload = `${nonce}.${issuedAt}`;
    return `${payload}.${this.hmac(payload)}`;
  }

  /** Returns the nonce, or null if the blob is forged, malformed, or past its TTL. */
  private verify(state: string): string | null {
    const parts = state.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [nonce, issuedAt, signature] = parts as [string, string, string];
    const expected = this.hmac(`${nonce}.${issuedAt}`);

    // Constant-time: `===` leaks how many leading bytes matched through timing, which is enough to
    // forge a signature byte by byte given enough attempts.
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }

    // The Redis record's TTL is the real expiry; this is a cheap pre-filter.
    if (Date.now() - Number(issuedAt) > GOOGLE_AUTH_STATE_TTL_SECONDS * 1000) {
      return null;
    }

    return nonce;
  }

  private hmac(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  /** Only the hash is persisted, so a Redis dump does not hand out live round-trip bindings. */
  private hashSid(sid: string): string {
    return createHash('sha256').update(sid).digest('base64url');
  }

  private sidMatches(sid: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashSid(sid));
    const expected = Buffer.from(expectedHash);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
