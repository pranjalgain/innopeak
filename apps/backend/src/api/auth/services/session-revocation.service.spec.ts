import { SessionRevocationService } from './session-revocation.service';

import { ACCESS_TOKEN_TTL_SECONDS } from '../constants/auth.constants';

describe('SessionRevocationService', () => {
  const NOW_MS = Date.parse('2026-10-15T10:00:00.400Z');
  const NOW_S = Math.floor(NOW_MS / 1000);
  let redis: { set: jest.Mock; mget: jest.Mock };
  let target: SessionRevocationService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW_MS);
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      mget: jest.fn().mockResolvedValue([null, null]),
    };
    target = new SessionRevocationService(redis as never);
  });

  afterEach(() => jest.useRealTimers());

  describe('marking', () => {
    // Everything issued up to and including the second of the event ends, since no fresh token follows it.
    it('marks the second after the current one for a user, so tokens issued in the second of the event end too', async () => {
      await target.revokeUser('user-1');

      expect(redis.set).toHaveBeenCalledWith(
        'auth:sessions-revoked-after:user:user-1',
        String(NOW_S + 1),
        'EX',
        expect.any(Number)
      );
    });

    // A password change mints the caller's fresh tokens straight afterwards, in the same second.
    it('can spare the current second, for the caller who is issued a fresh token right after', async () => {
      await target.revokeUser('user-1', { exceptCurrentSecond: true });

      expect(redis.set).toHaveBeenCalledWith(
        'auth:sessions-revoked-after:user:user-1',
        String(NOW_S),
        'EX',
        expect.any(Number)
      );
    });

    it('marks a whole business under its own key', async () => {
      await target.revokeTenant('tenant-1');

      expect(redis.set).toHaveBeenCalledWith(
        'auth:sessions-revoked-after:tenant:tenant-1',
        String(NOW_S + 1),
        'EX',
        expect.any(Number)
      );
    });

    it('lets a mark expire once no access token it could apply to is left', async () => {
      await target.revokeUser('user-1');

      const ttl = redis.set.mock.calls[0]?.[3] as number;
      expect(ttl).toBeGreaterThanOrEqual(ACCESS_TOKEN_TTL_SECONDS);
    });

    it('never throws when Redis is down: the action that caused it already took effect', async () => {
      redis.set.mockRejectedValue(new Error('redis down'));

      await expect(target.revokeUser('user-1')).resolves.toBeUndefined();
      await expect(target.revokeTenant('tenant-1')).resolves.toBeUndefined();
    });
  });

  describe('isRevoked', () => {
    const ask = (issuedAt: number | undefined): Promise<boolean> =>
      target.isRevoked({ userId: 'user-1', tenantId: 'tenant-1', issuedAt });

    // A platform admin belongs to no business, so only the user mark applies.
    it('reads only the user mark when there is no tenant', async () => {
      redis.mget.mockResolvedValue([String(NOW_S + 1)]);

      await expect(target.isRevoked({ userId: 'admin-1', issuedAt: NOW_S })).resolves.toBe(true);

      expect(redis.mget).toHaveBeenCalledWith('auth:sessions-revoked-after:user:admin-1');
    });

    it('reads both marks in one round trip', async () => {
      await ask(NOW_S);

      expect(redis.mget).toHaveBeenCalledTimes(1);
      expect(redis.mget).toHaveBeenCalledWith(
        'auth:sessions-revoked-after:user:user-1',
        'auth:sessions-revoked-after:tenant:tenant-1'
      );
    });

    it('lets a token through when nothing is marked', async () => {
      await expect(ask(NOW_S - 100)).resolves.toBe(false);
    });

    it('refuses a token issued before the user mark, and accepts one issued at or after it', async () => {
      redis.mget.mockResolvedValue([String(NOW_S), null]);

      await expect(ask(NOW_S - 1)).resolves.toBe(true);
      await expect(ask(NOW_S)).resolves.toBe(false);
      await expect(ask(NOW_S + 5)).resolves.toBe(false);
    });

    it('refuses a token issued before the business mark, whoever the user is', async () => {
      redis.mget.mockResolvedValue([null, String(NOW_S)]);

      await expect(ask(NOW_S - 1)).resolves.toBe(true);
    });

    it('applies the stricter of the two marks', async () => {
      redis.mget.mockResolvedValue([String(NOW_S - 50), String(NOW_S)]);

      await expect(ask(NOW_S - 10)).resolves.toBe(true);
    });

    // A token that cannot be placed in time cannot be shown to postdate a revocation.
    it('refuses a token with no issue time when anything is marked, and not otherwise', async () => {
      await expect(ask(undefined)).resolves.toBe(false);

      redis.mget.mockResolvedValue([String(NOW_S), null]);
      await expect(ask(undefined)).resolves.toBe(true);
    });

    // Redis is already a hard dependency, and the refresh path still enforces standing within one access-token lifetime.
    it('fails open when Redis cannot be read, rather than failing every request', async () => {
      redis.mget.mockRejectedValue(new Error('redis down'));

      await expect(ask(NOW_S - 100)).resolves.toBe(false);
    });
  });

  // A password change marks its own second and hands the caller a fresh pair issued in that second; a refresh of that pair is judged
  // on its own `iat` and must pass, while anything minted before the change must not.
  describe('a password change racing a refresh', () => {
    it('lets the fresh pair issued in the second of the change through, and refuses an older token', async () => {
      redis.mget.mockResolvedValue([String(NOW_S), null]);

      await expect(
        target.isRevoked({ userId: 'user-1', tenantId: 'tenant-1', issuedAt: NOW_S })
      ).resolves.toBe(false);
      await expect(
        target.isRevoked({ userId: 'user-1', tenantId: 'tenant-1', issuedAt: NOW_S - 1 })
      ).resolves.toBe(true);
    });
  });

  // The shared Redis client queues a command for a dead connection indefinitely instead of rejecting it; without a bound every
  // authenticated request, and every logout, would wait for Redis to return.
  describe('during a Redis outage', () => {
    it('stops waiting for the read and lets the request through', async () => {
      redis.mget.mockReturnValue(new Promise(() => undefined));

      const outcome = target.isRevoked({ userId: 'user-1', tenantId: 'tenant-1', issuedAt: NOW_S });
      await jest.advanceTimersByTimeAsync(600);

      await expect(outcome).resolves.toBe(false);
    });

    it('stops waiting for the write, so logout and password change still answer', async () => {
      redis.set.mockReturnValue(new Promise(() => undefined));

      const outcome = target.revokeUser('user-1');
      await jest.advanceTimersByTimeAsync(600);

      await expect(outcome).resolves.toBeUndefined();
    });
  });
});
