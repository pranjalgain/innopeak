import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import { createMetricsGuard } from './metrics-guard.middleware';

const isLocal = jest.fn(() => true);
jest.mock('@config/deployment-target.util', () => ({
  isLocalDevelopment: (): boolean => isLocal(),
}));

describe('createMetricsGuard', () => {
  const build = (token: string | undefined) =>
    createMetricsGuard({ get: jest.fn(() => token) } as unknown as ConfigService<never>);

  const run = (guard: ReturnType<typeof build>, path: string, authorization?: string) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    guard(
      { path, headers: { authorization } } as unknown as Request,
      res as unknown as Response,
      next
    );
    return { res, next };
  };

  it('lets the scrape through with the right bearer token', () => {
    const { next, res } = run(build('s3cret'), '/metrics', 'Bearer s3cret');

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ['no header', undefined],
    ['the wrong token', 'Bearer nope'],
    ['a token of another length', 'Bearer s3cret-and-more'],
    ['a non-bearer scheme', 'Basic czNjcmV0'],
    ['an empty bearer', 'Bearer '],
  ])('answers 401 for %s', (_label, header) => {
    const { next, res } = run(build('s3cret'), '/metrics', header);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('matches the path case-insensitively, as Express routes do', () => {
    const { res } = run(build('s3cret'), '/Metrics');

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it.each(['/metrics/', '/Metrics//'])(
    'does not let a trailing slash (%s) around the guard',
    path => {
      const { next, res } = run(build('s3cret'), path);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('does not touch any other route', () => {
    const { next } = run(build('s3cret'), '/v1/reviews');

    expect(next).toHaveBeenCalled();
  });

  it('is a no-op when no token is configured (local development)', () => {
    const { next } = run(build(undefined), '/metrics');

    expect(next).toHaveBeenCalled();
  });

  // A staging box runs as `development` with a real frontend URL: no token there must not mean an open endpoint.
  describe('with no token configured', () => {
    afterEach(() => isLocal.mockReturnValue(true));

    it('serves /metrics on a local machine', () => {
      const { next } = run(build(undefined), '/metrics');

      expect(next).toHaveBeenCalled();
    });

    it('refuses /metrics anywhere else, and leaves other paths alone', () => {
      isLocal.mockReturnValue(false);

      const metrics = run(build(undefined), '/metrics');
      const other = run(build(undefined), '/v1/auth/login');

      expect(metrics.res.status).toHaveBeenCalledWith(503);
      expect(metrics.next).not.toHaveBeenCalled();
      expect(other.next).toHaveBeenCalled();
    });
  });
});
