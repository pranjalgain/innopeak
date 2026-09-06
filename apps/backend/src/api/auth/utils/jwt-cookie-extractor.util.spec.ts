import type { Request } from 'express';

import { fromAccessTokenCookie } from './jwt-cookie-extractor.util';

import { ACCESS_TOKEN_COOKIE_NAME } from '../constants/auth.constants';

describe('fromAccessTokenCookie', () => {
  it('returns the access_token cookie value when present', () => {
    const req = { cookies: { [ACCESS_TOKEN_COOKIE_NAME]: 'signed-jwt' } } as unknown as Request;

    expect(fromAccessTokenCookie(req)).toBe('signed-jwt');
  });

  it('returns null when the cookie is absent so ExtractJwt can fall through to the next extractor', () => {
    const req = { cookies: { refresh_token: 'unrelated' } } as unknown as Request;

    expect(fromAccessTokenCookie(req)).toBeNull();
  });

  it('returns null when req.cookies itself is undefined (cookie-parser not registered / no cookies sent)', () => {
    const req = {} as unknown as Request;

    expect(fromAccessTokenCookie(req)).toBeNull();
  });
});
