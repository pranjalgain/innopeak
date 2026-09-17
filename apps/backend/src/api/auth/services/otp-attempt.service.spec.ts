import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { createHash } from 'crypto';

import { OtpAttemptService } from './otp-attempt.service';

/**
 * `LoginAttemptService` hashes the submitted email before using it as a Redis key specifically so
 * "anyone with Redis read access sees no list of registered emails" (its own doc comment). This
 * service used to build its keys from the raw email instead — a plaintext `SCAN auth:otp-*` would
 * hand out every address that recently attempted OTP verification, exactly what the sibling
 * service was designed to prevent. Both key builders now hash the same way.
 */
describe('OtpAttemptService', () => {
  let target: OtpAttemptService;
  let store: Map<string, { value: string; expiresAt: number | null }>;

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
    await target.consumeAttempt('reviewer@example.com');

    const keys = [...store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(`auth:otp-attempts:${hash('reviewer@example.com')}`);
    expect(keys[0]).not.toContain('reviewer@example.com');
  });

  it('keys the resend cooldown by a hash of the email, not the raw address', async () => {
    await target.claimResend('reviewer@example.com');

    const keys = [...store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(`auth:otp-resend:${hash('reviewer@example.com')}`);
    expect(keys[0]).not.toContain('reviewer@example.com');
  });

  it('hashes two different emails to two different keys, so counters never collide', async () => {
    await target.consumeAttempt('reviewer-a@example.com');
    await target.consumeAttempt('reviewer-b@example.com');

    expect(store.size).toBe(2);
  });

  it('allows attempts up to the configured max, then rejects', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect(await target.consumeAttempt('reviewer@example.com')).toBe(true);
    }
    expect(await target.consumeAttempt('reviewer@example.com')).toBe(false);
  });

  it('reset clears the attempt counter for that email', async () => {
    await target.consumeAttempt('reviewer@example.com');
    await target.reset('reviewer@example.com');

    expect(store.size).toBe(0);
  });

  it('claimResend only lets the first caller through within the cooldown', async () => {
    expect(await target.claimResend('reviewer@example.com')).toBe(true);
    expect(await target.claimResend('reviewer@example.com')).toBe(false);
  });
});
