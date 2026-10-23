import type { Request } from 'express';

import { accessTokenIssuedAt, msUntilAccessTokenExpiry } from './token-expiry.util';

const FALLBACK = 123_456;

function jwtWith(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;
}

const requestWith = (cookie?: string, bearer?: string): Request =>
  ({
    path: '/v1/notifications/stream',
    cookies: cookie ? { access_token: cookie } : {},
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  }) as unknown as Request;

describe('msUntilAccessTokenExpiry', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T10:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('reads the time left from the cookie token', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;

    expect(msUntilAccessTokenExpiry(requestWith(jwtWith({ exp })), FALLBACK)).toBe(600_000);
  });

  it('falls back to the bearer header', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;

    expect(msUntilAccessTokenExpiry(requestWith(undefined, jwtWith({ exp })), FALLBACK)).toBe(
      60_000
    );
  });

  it('never goes negative for a token that has just expired', () => {
    const exp = Math.floor(Date.now() / 1000) - 5;

    expect(msUntilAccessTokenExpiry(requestWith(jwtWith({ exp })), FALLBACK)).toBe(0);
  });

  it.each([
    ['no token', requestWith()],
    ['a token without exp', requestWith(jwtWith({ sub: 'u' }))],
    ['a malformed token', requestWith('not-a-jwt')],
    ['a token whose payload is not JSON', requestWith('a.b.c')],
  ])('uses the fallback for %s', (_label, request) => {
    expect(msUntilAccessTokenExpiry(request, FALLBACK)).toBe(FALLBACK);
  });
});

describe('accessTokenIssuedAt', () => {
  it('reads the issue time from the cookie token', () => {
    expect(accessTokenIssuedAt(requestWith(jwtWith({ iat: 1_700_000_000 })))).toBe(1_700_000_000);
  });

  it('is undefined when the token has none or cannot be read', () => {
    expect(accessTokenIssuedAt(requestWith(jwtWith({ exp: 1 })))).toBeUndefined();
    expect(accessTokenIssuedAt(requestWith())).toBeUndefined();
  });
});
