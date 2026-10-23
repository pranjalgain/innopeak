import { buildCookieOptions, buildSessionHintCookieOptions } from './cookie-options.util';

describe('cookie options', () => {
  const original = { NODE_ENV: process.env['NODE_ENV'], FRONTEND_URL: process.env['FRONTEND_URL'] };

  const withEnv = (nodeEnv: string, frontendUrl: string | undefined): void => {
    process.env['NODE_ENV'] = nodeEnv;
    if (frontendUrl === undefined) {
      delete process.env['FRONTEND_URL'];
    } else {
      process.env['FRONTEND_URL'] = frontendUrl;
    }
  };

  afterEach(() => {
    process.env['NODE_ENV'] = original.NODE_ENV;
    if (original.FRONTEND_URL === undefined) {
      delete process.env['FRONTEND_URL'];
    } else {
      process.env['FRONTEND_URL'] = original.FRONTEND_URL;
    }
  });

  describe('Secure', () => {
    it('is set in production', () => {
      withEnv('production', 'https://app.innopeak.io');

      expect(buildCookieOptions('/').secure).toBe(true);
    });

    // A staging box runs as `development` but is served over https; its session cookies must not travel in the clear.
    it('is set wherever the frontend is served over https, even outside production', () => {
      withEnv('development', 'https://staging.innopeak.io');

      expect(buildCookieOptions('/').secure).toBe(true);
    });

    it('is left off on a plain-http local setup, where a Secure cookie would never be sent', () => {
      withEnv('development', 'http://localhost:3002');

      expect(buildCookieOptions('/').secure).toBe(false);
    });

    it('is left off when no frontend URL is configured outside production', () => {
      withEnv('development', undefined);

      expect(buildCookieOptions('/').secure).toBe(false);
    });
  });

  it('keeps the credential cookie httpOnly and the routing hint readable, both Lax', () => {
    withEnv('production', 'https://app.innopeak.io');

    expect(buildCookieOptions('/v1/auth', 60)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/v1/auth',
      maxAge: 60_000,
    });
    expect(buildSessionHintCookieOptions('/')).toMatchObject({ httpOnly: false, sameSite: 'lax' });
  });
});
