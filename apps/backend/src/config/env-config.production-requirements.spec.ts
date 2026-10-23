import { validationSchema } from './env-config.schema';

/** Whether the schema complains about `key` for an otherwise empty environment: only the one rule under test is of interest. */
function complainsAbout(key: string, env: Record<string, string>): boolean {
  const { error } = validationSchema.validate(env, { abortEarly: false, allowUnknown: true });
  return error?.details.some(detail => detail.path[0] === key) ?? false;
}

describe('production-only environment requirements', () => {
  describe('TRUST_PROXY_HOPS', () => {
    // Left unset behind a load balancer, every caller shares one rate-limit bucket; it must be a conscious answer.
    it('is required in production', () => {
      expect(complainsAbout('TRUST_PROXY_HOPS', { NODE_ENV: 'production' })).toBe(true);
    });

    it('accepts 0 (directly exposed) and a positive hop count in production', () => {
      expect(
        complainsAbout('TRUST_PROXY_HOPS', { NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' })
      ).toBe(false);
      expect(
        complainsAbout('TRUST_PROXY_HOPS', { NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' })
      ).toBe(false);
    });

    it('rejects a negative or fractional count', () => {
      expect(
        complainsAbout('TRUST_PROXY_HOPS', { NODE_ENV: 'production', TRUST_PROXY_HOPS: '-1' })
      ).toBe(true);
      expect(
        complainsAbout('TRUST_PROXY_HOPS', { NODE_ENV: 'production', TRUST_PROXY_HOPS: '1.5' })
      ).toBe(true);
    });

    it('is optional in development', () => {
      expect(complainsAbout('TRUST_PROXY_HOPS', { NODE_ENV: 'development' })).toBe(false);
    });
  });

  describe('DEV_VERIFY_EMAIL_TOKEN', () => {
    // The fixed code lets anyone verify any address. A staging box runs as `development` too, so beyond the production ban the
    // frontend URL has to be local for it to be accepted at all.
    const complains = (env: Record<string, string>): boolean =>
      complainsAbout('DEV_VERIFY_EMAIL_TOKEN', env);

    it('is refused in production', () => {
      expect(complains({ NODE_ENV: 'production', DEV_VERIFY_EMAIL_TOKEN: '000000' })).toBe(true);
    });

    it('is accepted in development for a local frontend', () => {
      const base = { NODE_ENV: 'development', DEV_VERIFY_EMAIL_TOKEN: '000000' };

      expect(complains({ ...base, FRONTEND_URL: 'http://localhost:3002' })).toBe(false);
      expect(complains({ ...base, FRONTEND_URL: 'http://127.0.0.1:3002' })).toBe(false);
    });

    // A blank frontend URL reads as "local" in the rest of the app; with a fixed sign-up code that must not pass, or an unset URL on a
    // reachable box would leave every address verifiable.
    it('is refused when the frontend URL is blank or missing, since that cannot show the box is local', () => {
      const base = { NODE_ENV: 'development', DEV_VERIFY_EMAIL_TOKEN: '000000' };

      expect(complains(base)).toBe(true);
      expect(complains({ ...base, FRONTEND_URL: '' })).toBe(true);
      expect(complains({ ...base, FRONTEND_URL: '   ' })).toBe(true);
    });

    it('is refused in development when the frontend is a real, reachable address', () => {
      const base = { NODE_ENV: 'development', DEV_VERIFY_EMAIL_TOKEN: '000000' };

      expect(complains({ ...base, FRONTEND_URL: 'https://staging.innopeak.io' })).toBe(true);
      expect(complains({ ...base, FRONTEND_URL: 'http://192.168.1.20:3002' })).toBe(true);
    });

    it('is not needed at all, so an empty one passes anywhere outside production', () => {
      expect(
        complains({
          NODE_ENV: 'development',
          DEV_VERIFY_EMAIL_TOKEN: '',
          FRONTEND_URL: 'https://staging.innopeak.io',
        })
      ).toBe(false);
    });
  });

  describe('GOOGLE_AUTH_STATE_SECRET', () => {
    // It signs the OAuth `state`; a short one is brute-forceable offline from one captured redirect, like a short JWT secret.
    it('must be long enough to resist guessing when it is set, and may be left empty', () => {
      expect(
        complainsAbout('GOOGLE_AUTH_STATE_SECRET', { GOOGLE_AUTH_STATE_SECRET: 'short' })
      ).toBe(true);
      expect(
        complainsAbout('GOOGLE_AUTH_STATE_SECRET', { GOOGLE_AUTH_STATE_SECRET: 'a'.repeat(32) })
      ).toBe(false);
      expect(complainsAbout('GOOGLE_AUTH_STATE_SECRET', { GOOGLE_AUTH_STATE_SECRET: '' })).toBe(
        false
      );
    });
  });

  describe('METRICS_TOKEN', () => {
    it('is required in production, and must be long enough to resist guessing', () => {
      expect(complainsAbout('METRICS_TOKEN', { NODE_ENV: 'production' })).toBe(true);
      expect(
        complainsAbout('METRICS_TOKEN', { NODE_ENV: 'production', METRICS_TOKEN: 'short' })
      ).toBe(true);
      expect(
        complainsAbout('METRICS_TOKEN', { NODE_ENV: 'production', METRICS_TOKEN: 'x'.repeat(32) })
      ).toBe(false);
    });

    it('is optional in development', () => {
      expect(complainsAbout('METRICS_TOKEN', { NODE_ENV: 'development' })).toBe(false);
    });
  });
});
