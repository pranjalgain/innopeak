import { isLocalDevelopment, shouldUseSecureCookies } from './deployment-target.util';

describe('development conveniences are tied to where the app is reachable', () => {
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

  describe('isLocalDevelopment', () => {
    it('is true for a development setup on this machine, or with no URL configured', () => {
      withEnv('development', 'http://localhost:3002');
      expect(isLocalDevelopment()).toBe(true);

      withEnv('development', undefined);
      expect(isLocalDevelopment()).toBe(true);
    });

    // A staging box also runs as `development`; without this it would log invite links and accept the fixed sign-up code.
    it('is false for a development build served from a real address', () => {
      withEnv('development', 'https://staging.innopeak.io');

      expect(isLocalDevelopment()).toBe(false);
    });

    it('is false in production, whatever the URL', () => {
      withEnv('production', 'http://localhost:3002');

      expect(isLocalDevelopment()).toBe(false);
    });
  });

  describe('shouldUseSecureCookies', () => {
    it('follows production or an https frontend, never a plain-http local one', () => {
      withEnv('production', undefined);
      expect(shouldUseSecureCookies()).toBe(true);

      withEnv('development', 'https://staging.innopeak.io');
      expect(shouldUseSecureCookies()).toBe(true);

      withEnv('development', 'http://localhost:3002');
      expect(shouldUseSecureCookies()).toBe(false);
    });
  });
});
