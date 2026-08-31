import { RouteNames } from '@common/route-names';
import type { NextFunction, Request, Response } from 'express';

import { CookieAuthMiddleware } from './cookies.middleware';

describe('CookieAuthMiddleware', () => {
  let middleware: CookieAuthMiddleware;
  let next: NextFunction;

  const buildRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      path: '/v1/users',
      headers: {},
      cookies: {},
      ...overrides,
    } as unknown as Request;
  };

  beforeEach(() => {
    middleware = new CookieAuthMiddleware();
    next = jest.fn();
  });

  // Regression guard: cookie-parser middleware is NOT registered in main.ts, so
  // `req.cookies` is genuinely `undefined` at runtime for every real request.
  // A previous lint-remediation pass stripped the optional-chaining/defaulting
  // logic as "unnecessary", which crashed every request in a Docker smoke test.
  it('does not throw when req.cookies is undefined (no cookie-parser registered) and simply finds no tokens', () => {
    const req = buildRequest({ cookies: undefined });

    expect(() => {
      middleware.use(req, {} as Response, next);
    }).not.toThrow();

    expect(req.headers['authorization']).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('picks up the access token (sid) from a populated cookies object for a non-admin route', () => {
    const req = buildRequest({
      path: '/v1/users',
      cookies: { sid: 'access-token-123' },
    });

    middleware.use(req, {} as Response, next);

    expect(req.headers['authorization']).toBe('Bearer access-token-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to the refresh_token cookie when sid is absent', () => {
    const req = buildRequest({
      path: '/v1/users',
      cookies: { refresh_token: 'refresh-token-456' },
    });

    middleware.use(req, {} as Response, next);

    expect(req.headers['authorization']).toBe('Bearer refresh-token-456');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to the temp_sid cookie when neither sid nor refresh_token are present', () => {
    const req = buildRequest({
      path: '/v1/users',
      cookies: { temp_sid: 'temp-token-789' },
    });

    middleware.use(req, {} as Response, next);

    expect(req.headers['authorization']).toBe('Bearer temp-token-789');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite an existing authorization header', () => {
    const req = buildRequest({
      path: '/v1/users',
      headers: { authorization: 'Bearer already-set' },
      cookies: { sid: 'access-token-123' },
    });

    middleware.use(req, {} as Response, next);

    expect(req.headers['authorization']).toBe('Bearer already-set');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses the admin_sid cookie for dev-tools (admin) routes', () => {
    const req = buildRequest({
      path: `/${RouteNames.DEV_TOOLS}/dashboard`,
      cookies: { sid: 'user-token', admin_sid: 'admin-token' },
    });

    middleware.use(req, {} as Response, next);

    expect(req.headers['authorization']).toBe('Bearer admin-token');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('calls next() even when no relevant cookies are present at all', () => {
    const req = buildRequest({ cookies: {} });

    middleware.use(req, {} as Response, next);

    expect(req.headers['authorization']).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
