import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { createHash } from 'crypto';

import { OtpAttemptService } from './otp-attempt.service';

import { OtpScope } from '../enums/otp-scope.enum';

/**
 * Keys are built from a hash of the email, not the raw address: a plaintext `SCAN auth:otp-*` would
 * list every address that attempted OTP verification.
 */
describe('OtpAttemptService', () => {
  let target: OtpAttemptService;
  let store: Map<string, { value: string; expiresAt: number | null }>;

  const verify = (identity: string): { scope: OtpScope; identity: string } => ({
    scope: OtpScope.VERIFY_EMAIL,
    identity,
  });

  function hash(email: string): string {
    return createHash('sha256').update(email).digest('hex');
  }

  beforeEach(async () => {
    store = new Map();
    const redis = {
      incr: jest.fn((key: string) => {
        const current = store.get(key);
        const next = current ? Number(current.value) + 1 : 1;
        store.set(key, { value: String(next), expiresAt: current?.expiresAt ?? null });
        return Promise.resolve(next);
      }),
      ttl: jest.fn((key: string) => {
        const entry = store.get(key);
        return Promise.resolve(
          entry?.expiresAt === null || entry?.expiresAt === undefined ? -1 : 1
        );
      }),
      expire: jest.fn((key: string, seconds: number) => {
        const entry = store.get(key);
        if (entry) entry.expiresAt = seconds;
        return Promise.resolve(1);
      }),
      del: jest.fn((key: string) => {
        store.delete(key);
        return Promise.resolve(1);
      }),
      set: jest.fn((key: string, value: string) => {
        if (store.has(key)) return Promise.resolve(null); // NX
        store.set(key, { value, expiresAt: null });
        return Promise.resolve('OK');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OtpAttemptService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();

    target = module.get(OtpAttemptService);
  });

  it('keys the attempt counter by a hash of the email, not the raw address', async () => {
    await target.consumeAttempt(verify('reviewer@example.com'));

    const keys = [...store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(`auth:otp-attempts:verify-email:${hash('reviewer@example.com')}`);
    expect(keys[0]).not.toContain('reviewer@example.com');
  });

  it('keys the resend cooldown by a hash of the email, not the raw address', async () => {
    await target.claimResend(verify('reviewer@example.com'));

    const keys = [...store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(`auth:otp-resend:verify-email:${hash('reviewer@example.com')}`);
    expect(keys[0]).not.toContain('reviewer@example.com');
  });

  it('hashes two different emails to two different keys, so counters never collide', async () => {
    await target.consumeAttempt(verify('reviewer-a@example.com'));
    await target.consumeAttempt(verify('reviewer-b@example.com'));

    expect(store.size).toBe(2);
  });

  it('allows attempts up to the configured max, then rejects', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect(await target.consumeAttempt(verify('reviewer@example.com'))).toBe(true);
    }
    expect(await target.consumeAttempt(verify('reviewer@example.com'))).toBe(false);
  });

  it('reset clears the attempt counter for that email', async () => {
    await target.consumeAttempt(verify('reviewer@example.com'));
    await target.reset(verify('reviewer@example.com'));

    expect(store.size).toBe(0);
  });

  it('claimResend only lets the first caller through within the cooldown', async () => {
    expect(await target.claimResend(verify('reviewer@example.com'))).toBe(true);
    expect(await target.claimResend(verify('reviewer@example.com'))).toBe(false);
  });

  // The bug: one counter per address meant 10 anonymous guesses at the public sign-up code locked the owner out of their own
  // set-password and delete-account codes, and out of an admin's.
  it('releaseResend frees a claimed cooldown, for a code that was never sent', async () => {
    expect(await target.claimResend(verify('reviewer@example.com'))).toBe(true);

    await target.releaseResend(verify('reviewer@example.com'));

    expect(await target.claimResend(verify('reviewer@example.com'))).toBe(true);
  });

  describe('scopes', () => {
    it('keeps the public budget and the signed-in budgets apart, even for the same person', async () => {
      for (let i = 0; i < 10; i += 1) {
        await target.consumeAttempt(verify('owner@example.com'));
      }
      expect(await target.consumeAttempt(verify('owner@example.com'))).toBe(false);

      expect(
        await target.consumeAttempt({ scope: OtpScope.SET_PASSWORD, identity: 'user-1' })
      ).toBe(true);
      expect(
        await target.consumeAttempt({ scope: OtpScope.DELETE_ACCOUNT, identity: 'user-1' })
      ).toBe(true);
      expect(
        await target.consumeAttempt({ scope: OtpScope.ADMIN_SET_PASSWORD, identity: 'user-1' })
      ).toBe(true);
    });

    it('keeps each flow and each principal on its own counter and resend cooldown', async () => {
      await target.consumeAttempt({ scope: OtpScope.SET_PASSWORD, identity: 'user-1' });
      await target.consumeAttempt({ scope: OtpScope.SET_PASSWORD, identity: 'user-2' });
      await target.consumeAttempt({ scope: OtpScope.DELETE_ACCOUNT, identity: 'user-1' });
      expect(store.size).toBe(3);

      expect(await target.claimResend({ scope: OtpScope.SET_PASSWORD, identity: 'user-1' })).toBe(
        true
      );
      expect(await target.claimResend({ scope: OtpScope.DELETE_ACCOUNT, identity: 'user-1' })).toBe(
        true
      );
      expect(await target.claimResend({ scope: OtpScope.SET_PASSWORD, identity: 'user-1' })).toBe(
        false
      );
    });

    it('resets only the budget it is told to', async () => {
      await target.consumeAttempt({ scope: OtpScope.SET_PASSWORD, identity: 'user-1' });
      await target.consumeAttempt({ scope: OtpScope.DELETE_ACCOUNT, identity: 'user-1' });

      await target.reset({ scope: OtpScope.SET_PASSWORD, identity: 'user-1' });

      expect(store.size).toBe(1);
    });

    it('never puts the raw identity in a key', async () => {
      await target.consumeAttempt({ scope: OtpScope.SET_PASSWORD, identity: 'user-1' });

      expect([...store.keys()].some(key => key.includes('user-1'))).toBe(false);
    });
  });
});
