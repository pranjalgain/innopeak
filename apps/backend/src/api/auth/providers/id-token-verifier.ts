import { createPublicKey, createVerify, type KeyObject } from 'crypto';

export interface IdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  tid?: string;
  nonce?: string;
  exp?: number;
  nbf?: number;
  email?: string;
  name?: string;
  preferred_username?: string;
  xms_edov?: unknown;
  [claim: string]: unknown;
}

export interface IdTokenExpectations {
  audience: string;
  nonce: string;
  /** Receives the token's own claims so a multi-tenant issuer (`.../<tid>/v2.0`) can be derived from `tid`. */
  expectedIssuer: (claims: IdTokenClaims) => string;
}

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

const KEY_CACHE_TTL_MS = 60 * 60 * 1000;
/** An unknown `kid` refetches at once (a rotated key must not wait), but never twice within this window overall... */
const REFETCH_FLOOR_MS = 5 * 1000;
/** ...and a `kid` that a refetch did not turn up is not retried for this long. */
const MISSED_KID_COOLDOWN_MS = 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10 * 1000;
const CLOCK_SKEW_SECONDS = 60;

/**
 * RS256 ID-token verification against a JWKS endpoint, with no dependency beyond Node's `crypto`.
 *
 * The token arrives straight from the provider's token endpoint over TLS, which the OIDC spec lets a
 * client trust without checking the signature; verifying it anyway costs little and makes the claims
 * safe to act on if a proxy or a mixed-up endpoint ever sits in between. Only RS256 is accepted, so
 * an `alg` of `none` or an HMAC keyed with a public key is refused outright.
 */
export class IdTokenVerifier {
  private keys = new Map<string, KeyObject>();
  private loadedAt = 0;
  private lastRefetchAt = 0;
  /** One request at a time: concurrent callbacks that all find the cache stale share it. */
  private loading: Promise<void> | null = null;
  private readonly missedKids = new Map<string, number>();

  constructor(
    private readonly jwksUri: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  async verify(
    token: string,
    expected: IdTokenExpectations,
    now = Date.now()
  ): Promise<IdTokenClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('ID token is not a JWT');
    }
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    const header = this.parseJson<{ alg?: string; kid?: string }>(headerB64, 'header');
    if (header.alg !== 'RS256') {
      throw new Error('ID token uses an unsupported signing algorithm');
    }
    if (header.kid === undefined || header.kid === '') {
      throw new Error('ID token has no key id');
    }

    const key = await this.keyFor(header.kid, now);
    const signature = Buffer.from(signatureB64, 'base64url');
    const valid = createVerify('RSA-SHA256')
      .update(`${headerB64}.${payloadB64}`)
      .verify(key, signature);
    if (!valid) {
      throw new Error('ID token signature is invalid');
    }

    const claims = this.parseJson<IdTokenClaims>(payloadB64, 'payload');
    this.checkClaims(claims, expected, now);
    return claims;
  }

  private checkClaims(claims: IdTokenClaims, expected: IdTokenExpectations, now: number): void {
    const nowSeconds = Math.floor(now / 1000);
    if (claims.aud !== expected.audience) {
      throw new Error('ID token audience does not match this client');
    }
    if (claims.tid === undefined || claims.tid === '') {
      throw new Error('ID token has no tenant');
    }
    if (claims.iss !== expected.expectedIssuer(claims)) {
      throw new Error('ID token issuer does not match its tenant');
    }
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
      throw new Error('ID token has expired');
    }
    if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SECONDS > nowSeconds) {
      throw new Error('ID token is not valid yet');
    }
    if (claims.nonce !== expected.nonce) {
      throw new Error('ID token nonce does not match the request');
    }
    if (claims.sub === undefined || claims.sub === '') {
      throw new Error('ID token has no subject');
    }
  }

  private async keyFor(kid: string, now: number): Promise<KeyObject> {
    const cached = this.keys.get(kid);
    const fresh = this.loadedAt !== 0 && now - this.loadedAt < KEY_CACHE_TTL_MS;
    if (cached !== undefined && fresh) {
      return cached;
    }

    if (cached !== undefined) {
      // Stale: refresh, but an unreachable JWKS endpoint must not block a key that still verifies. A key the refreshed set
      // no longer lists has been retired, so it is not used.
      try {
        await this.reload(now);
      } catch {
        return cached;
      }
      return this.requireLoaded(kid);
    }

    // Unknown kid, usually a rotation: refetch straight away, but rate-limited so a run of unknown kids cannot turn this
    // into a stream of requests against the JWKS endpoint.
    const missedAt = this.missedKids.get(kid);
    const recentlyMissed = missedAt !== undefined && now - missedAt < MISSED_KID_COOLDOWN_MS;
    const justFetched = this.loadedAt !== 0 && now - this.lastRefetchAt < REFETCH_FLOOR_MS;
    if (recentlyMissed || justFetched) {
      throw new Error('ID token signing key is unknown');
    }
    await this.reload(now);

    if (!this.keys.has(kid)) {
      this.rememberMiss(kid, now);
    }
    return this.requireLoaded(kid);
  }

  private requireLoaded(kid: string): KeyObject {
    const loaded = this.keys.get(kid);
    if (loaded === undefined) {
      throw new Error('ID token signing key is unknown');
    }
    return loaded;
  }

  private rememberMiss(kid: string, now: number): void {
    for (const [missed, at] of this.missedKids) {
      if (now - at >= MISSED_KID_COOLDOWN_MS) this.missedKids.delete(missed);
    }
    this.missedKids.set(kid, now);
  }

  private reload(now: number): Promise<void> {
    this.loading ??= this.load(now).finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async load(now: number): Promise<void> {
    this.lastRefetchAt = now;
    const response = await this.fetchImpl(this.jwksUri, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`JWKS request failed with ${response.status}`);
    }
    const body = (await response.json()) as { keys?: Jwk[] };

    const next = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (
        jwk.kty === 'RSA' &&
        jwk.kid !== undefined &&
        jwk.n !== undefined &&
        jwk.e !== undefined
      ) {
        next.set(
          jwk.kid,
          createPublicKey({ key: jwk as unknown as import('crypto').JsonWebKey, format: 'jwk' })
        );
      }
    }
    this.keys = next;
    this.loadedAt = now;
  }

  private parseJson<T>(segment: string, label: string): T {
    try {
      return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
    } catch {
      throw new Error(`ID token ${label} is not valid JSON`);
    }
  }
}
