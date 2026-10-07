import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { LoginAttemptScope, LoginAttemptService } from './login-attempt.service';

import { LOGIN_LOCKOUT_THRESHOLD } from '../constants/auth.constants';

/**
 * Counters are scoped per credential space: one address can be both a platform admin and a tenant
 * owner.
 */
describe('LoginAttemptService', () => {
  const EMAIL = 'shared@innopeak.com';

  let target: LoginAttemptService;
  let store: Map<string, string>;

  beforeEach(async () => {
    store = new Map();
    const redis = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      incr: jest.fn((key: string) => {
        const next = Number(store.get(key) ?? 0) + 1;
        store.set(key, String(next));
        return Promise.resolve(next);
      }),
      ttl: jest.fn(() => Promise.resolve(1)),
      expire: jest.fn(() => Promise.resolve(1)),
      del: jest.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0)),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [LoginAttemptService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();

    target = moduleRef.get(LoginAttemptService);
  });

  async function exhaust(scope: LoginAttemptScope): Promise<void> {
    for (let i = 0; i < LOGIN_LOCKOUT_THRESHOLD; i += 1) {
      await target.recordFailure(EMAIL, scope);
    }
  }

  it('locks out the scope that exhausted its budget', async () => {
    await exhaust(LoginAttemptScope.ADMIN);

    await expect(target.isLockedOut(EMAIL, LoginAttemptScope.ADMIN)).resolves.toBe(true);
  });

  it('leaves the other scope untouched when one is exhausted', async () => {
    await exhaust(LoginAttemptScope.ADMIN);

    await expect(target.isLockedOut(EMAIL, LoginAttemptScope.TENANT)).resolves.toBe(false);
  });

  /**
   * Regression: a successful tenant login must not reset the counter guarding the admin password on
   * the same address.
   */
  it('does not let a successful tenant login clear the admin lockout on the same address', async () => {
    await exhaust(LoginAttemptScope.ADMIN);

    await target.reset(EMAIL, LoginAttemptScope.TENANT);

    await expect(target.isLockedOut(EMAIL, LoginAttemptScope.ADMIN)).resolves.toBe(true);
  });

  it('clears its own scope on a successful login', async () => {
    await exhaust(LoginAttemptScope.ADMIN);

    await target.reset(EMAIL, LoginAttemptScope.ADMIN);

    await expect(target.isLockedOut(EMAIL, LoginAttemptScope.ADMIN)).resolves.toBe(false);
  });

  /** The address must never appear in a key — `SCAN auth:login-fail:*` must not enumerate users. */
  it('never stores the raw email in the key', async () => {
    await target.recordFailure(EMAIL, LoginAttemptScope.TENANT);

    for (const key of store.keys()) {
      expect(key).not.toContain(EMAIL);
      expect(key).toContain(LoginAttemptScope.TENANT);
    }
  });
});
