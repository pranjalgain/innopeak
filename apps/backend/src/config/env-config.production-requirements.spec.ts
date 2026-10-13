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
