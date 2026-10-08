import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { PendingSsoSignupService } from './pending-sso-signup.service';

import { SsoProvider } from '../constants/sso-auth.constants';

describe('PendingSsoSignupService', () => {
  let target: PendingSsoSignupService;
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
      providers: [PendingSsoSignupService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();

    target = module.get(PendingSsoSignupService);
  });

  it('round-trips the identity the completion endpoint depends on', async () => {
    const nonce = await target.mint({
      provider: SsoProvider.MICROSOFT,
      providerUserId: 'ms-sub-1',
      email: 'owner@example.com',
      name: 'Jordan Lee',
    });

    const result = await target.consume(nonce);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The provider travels with the identity, so the business-name step links the right one.
      expect(result.identity).toEqual({
        provider: SsoProvider.MICROSOFT,
        providerUserId: 'ms-sub-1',
        email: 'owner@example.com',
        name: 'Jordan Lee',
      });
    }
  });

  /**
   * `mint` must fail loudly on a nonce collision rather than hand back a nonce whose Redis record
   * belongs to another signup.
   */
  it('throws rather than silently minting a nonce whose record write lost the NX race', async () => {
    redis.set.mockResolvedValueOnce(null);

    await expect(
      target.mint({
        provider: SsoProvider.GOOGLE,
        providerUserId: 'google-sub-1',
        email: 'owner@example.com',
        name: null,
      })
    ).rejects.toThrow('nonce collision');
  });

  it('rejects a replay — a second completion attempt finds no nonce', async () => {
    const nonce = await target.mint({
      provider: SsoProvider.GOOGLE,
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

  // TRANSITIONAL: a Google signup that reached the business-name step before the rename.
  it('still completes a record minted under the old Google-only prefix, as a Google identity', async () => {
    store.set(
      'auth:google-pending-signup:old-nonce',
      JSON.stringify({
        providerUserId: 'google-sub-1',
        email: 'owner@example.com',
        name: 'Jordan Lee',
      })
    );

    await expect(target.consume('old-nonce')).resolves.toEqual({
      ok: true,
      identity: {
        provider: SsoProvider.GOOGLE,
        providerUserId: 'google-sub-1',
        email: 'owner@example.com',
        name: 'Jordan Lee',
      },
    });
    // Single-use under the old prefix too.
    await expect(target.consume('old-nonce')).resolves.toEqual({ ok: false });
  });
});
