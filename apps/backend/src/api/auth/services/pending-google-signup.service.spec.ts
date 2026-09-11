import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { PendingGoogleSignupService } from './pending-google-signup.service';

describe('PendingGoogleSignupService', () => {
  let target: PendingGoogleSignupService;
  let store: Map<string, string>;
  let redis: { set: jest.Mock; getdel: jest.Mock };

  beforeEach(async () => {
    store = new Map();
    redis = {
      set: jest.fn((key: string, value: string) => {
        if (store.has(key)) return Promise.resolve(null); // NX
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      // GETDEL is what makes the nonce single-use — modelled faithfully, since a read-then-delete
      // stand-in would let the replay test pass for the wrong reason.
      getdel: jest.fn((key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return Promise.resolve(value);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PendingGoogleSignupService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();

    target = module.get(PendingGoogleSignupService);
  });

  it('round-trips the identity the completion endpoint depends on', async () => {
    const nonce = await target.mint({
      providerUserId: 'google-sub-1',
      email: 'owner@example.com',
      name: 'Jordan Lee',
    });

    const result = await target.consume(nonce);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity).toEqual({
        providerUserId: 'google-sub-1',
        email: 'owner@example.com',
        name: 'Jordan Lee',
      });
    }
  });

  /**
   * At 256 bits of randomness this never happens in practice, but a silent overwrite-miss here
   * would hand the caller a nonce whose Redis record belongs to someone else's in-flight signup —
   * surfacing later as a generic, unexplained consume failure. `mint` must fail loudly instead.
   */
  it('throws rather than silently minting a nonce whose record write lost the NX race', async () => {
    redis.set.mockResolvedValueOnce(null);

    await expect(
      target.mint({ providerUserId: 'google-sub-1', email: 'owner@example.com', name: null })
    ).rejects.toThrow('nonce collision');
  });

  it('rejects a replay — a second completion attempt finds no nonce', async () => {
    const nonce = await target.mint({
      providerUserId: 'google-sub-1',
      email: 'owner@example.com',
      name: null,
    });

    await expect(target.consume(nonce)).resolves.toMatchObject({ ok: true });
    await expect(target.consume(nonce)).resolves.toEqual({ ok: false });
  });

  it('rejects a missing or empty nonce without touching Redis', async () => {
    await expect(target.consume(undefined)).resolves.toEqual({ ok: false });
    await expect(target.consume('')).resolves.toEqual({ ok: false });
  });

  it('rejects an unknown nonce', async () => {
    await expect(target.consume('never-minted')).resolves.toEqual({ ok: false });
  });
});
