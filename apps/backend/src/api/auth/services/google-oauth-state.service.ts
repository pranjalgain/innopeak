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
 * A signed blob is a bearer credential and its signature proves only that we minted it, never who
 * completes the round trip. So: (1) the blob only rejects garbage cheaply and recovers the nonce,
 * nothing the write path acts on is read from it; (2) a Redis record is authoritative, consumed
 * with `GETDEL` before the code is exchanged, so a replay finds nothing and concurrent callbacks
 * cannot both pass; (3) a `google_auth_sid` cookie binds the round trip to the browser that began
 * it, defeating a mailed consent link.
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

    // Built conditionally: `exactOptionalPropertyTypes` rejects assigning a literal `undefined`,
    // which would also be a real key on the record.
    const record: GoogleAuthStateRecord = {
      intent: input.intent,
      sidHash: this.hashSid(sid),
      ...(input.inviteToken !== undefined ? { inviteToken: input.inviteToken } : {}),
    };

    // `NX` so a nonce collision fails rather than overwriting another in-flight consent. Checked
    // rather than assumed: a silent miss would return a state whose Redis record is someone else's,
    // later failing as an indistinguishable INVALID_STATE. Not expected to fire at 192 bits.
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
   * Every failure returns the same `{ ok: false }`: expired, replayed, forged and wrong-browser are
   * deliberately indistinguishable to the caller.
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
