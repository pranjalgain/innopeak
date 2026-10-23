import { EnvConfig } from '@config/env.config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

import {
  OAUTH_STATE_TTL_SECONDS,
  oauthStateKey,
  SsoProvider,
} from '../constants/sso-auth.constants';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import type {
  ConsumeOAuthStateResult,
  MintedOAuthState,
  OAuthStateRecord,
} from '../types/auth.type';

/**
 * A signed blob is a bearer credential and its signature proves only that we minted it, never who
 * completes the round trip. So: (1) the blob only rejects garbage cheaply and recovers the nonce,
 * nothing the write path acts on is read from it; (2) a Redis record is authoritative, consumed
 * with `GETDEL` before the code is exchanged, so a replay finds nothing and concurrent callbacks
 * cannot both pass; (3) a `google_auth_sid` cookie binds the round trip to the browser that began
 * it, defeating a mailed consent link.
 *
 * Shared by every SSO provider: the record, the Redis key and the signature all carry the provider,
 * so a state minted for Google is rejected at the Microsoft callback and the reverse.
 */
/** Domain-separates the key derived from `JWT_SECRET` from every other use of that secret. */
const OAUTH_STATE_KEY_LABEL = 'innopeak:oauth-state-signing-key:v1';

@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);
  private readonly secret: Buffer | string;

  constructor(
    configService: ConfigService<EnvConfig>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    this.secret = OAuthStateService.resolveSecret(configService);
  }

  /**
   * `GOOGLE_AUTH_STATE_SECRET` (required in production), else a key *derived* from `JWT_SECRET` for local development: HMAC-ing a
   * fixed label under it gives the state signature a key of its own, so it never signs with the same bytes as the access tokens.
   * Deterministic, so a state minted before a hot reload still verifies after it. With neither set this refuses to start rather than
   * signing under a constant anyone can read in the source (the env schema makes `JWT_SECRET` mandatory, so this is a backstop).
   */
  private static resolveSecret(configService: ConfigService<EnvConfig>): Buffer | string {
    const dedicated = configService.get<string>('GOOGLE_AUTH_STATE_SECRET');
    if (dedicated !== undefined && dedicated !== '') {
      return dedicated;
    }

    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (jwtSecret === undefined || jwtSecret === '') {
      throw new Error('OAuth state needs GOOGLE_AUTH_STATE_SECRET or JWT_SECRET to sign with.');
    }
    return createHmac('sha256', jwtSecret).update(OAUTH_STATE_KEY_LABEL).digest();
  }

  /**
   * `pkce` is for providers that recommend it (Microsoft): the verifier is stored only in the Redis
   * record and only its S256 challenge leaves the server. `nonce` is the OIDC replay binding the
   * provider echoes in its ID token.
   */
  async mint(input: {
    provider: SsoProvider;
    intent: OAuthIntent;
    inviteToken?: string;
    pkce?: boolean;
  }): Promise<MintedOAuthState> {
    const nonce = randomBytes(24).toString('base64url');
    const sid = randomBytes(32).toString('base64url');
    const codeVerifier = input.pkce === true ? randomBytes(48).toString('base64url') : undefined;

    // Built conditionally: `exactOptionalPropertyTypes` rejects assigning a literal `undefined`,
    // which would also be a real key on the record.
    const record: OAuthStateRecord = {
      provider: input.provider,
      intent: input.intent,
      sidHash: this.hashSid(sid),
      nonce,
      ...(input.inviteToken !== undefined ? { inviteToken: input.inviteToken } : {}),
      ...(codeVerifier !== undefined ? { codeVerifier } : {}),
    };

    // `NX` so a nonce collision fails rather than overwriting another in-flight consent. Checked
    // rather than assumed: a silent miss would return a state whose Redis record is someone else's,
    // later failing as an indistinguishable INVALID_STATE. Not expected to fire at 192 bits.
    const claimed = await this.redis.set(
      oauthStateKey(input.provider, nonce),
      JSON.stringify(record),
      'EX',
      OAUTH_STATE_TTL_SECONDS,
      'NX'
    );

    if (claimed !== 'OK') {
      this.logger.error(`OAuth state nonce collision on mint (intent: ${input.intent})`);
      throw new Error('Failed to mint OAuth state: nonce collision');
    }

    return {
      state: this.sign(input.provider, nonce),
      sid,
      nonce,
      ...(codeVerifier !== undefined
        ? { codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url') }
        : {}),
    };
  }

  /**
   * Every failure returns the same `{ ok: false }`: expired, replayed, forged and wrong-browser are
   * deliberately indistinguishable to the caller.
   */
  async consume(
    provider: SsoProvider,
    state: string | undefined,
    sid: string | undefined
  ): Promise<ConsumeOAuthStateResult> {
    if (state === undefined || state === '') {
      return { ok: false };
    }

    const nonce = this.verify(provider, state);
    if (nonce === null) {
      return { ok: false };
    }

    const raw = await this.redis.getdel(oauthStateKey(provider, nonce));
    if (raw === null) {
      return { ok: false };
    }

    const record = JSON.parse(raw) as OAuthStateRecord;

    if (sid === undefined || !this.sidMatches(sid, record.sidHash)) {
      this.logger.warn(
        `${provider} auth callback rejected: browser-binding cookie missing or mismatched. This is the expected outcome of a mailed consent link.`
      );
      return { ok: false };
    }

    return { ok: true, record };
  }

  private sign(provider: SsoProvider, nonce: string): string {
    const issuedAt = Date.now().toString();
    const payload = `${nonce}.${issuedAt}`;
    return `${payload}.${this.hmac(provider, payload)}`;
  }

  /** Returns the nonce, or null if the blob is forged, malformed, or past its TTL. */
  private verify(provider: SsoProvider, state: string): string | null {
    // Express hands a repeated query key (`?state=a&state=b`) over as an array, whatever the type says; `.split` on it threw a 500.
    if (typeof state !== 'string') {
      return null;
    }
    const parts = state.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [nonce, issuedAt, signature] = parts as [string, string, string];
    const expected = this.hmac(provider, `${nonce}.${issuedAt}`);

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
    if (Date.now() - Number(issuedAt) > OAUTH_STATE_TTL_SECONDS * 1000) {
      return null;
    }

    return nonce;
  }

  /** The provider is part of what is signed, so a state from one provider never verifies at another's. */
  private hmac(provider: SsoProvider, payload: string): string {
    return createHmac('sha256', this.secret).update(`${provider}:${payload}`).digest('base64url');
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
