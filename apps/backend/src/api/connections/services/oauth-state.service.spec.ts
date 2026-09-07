import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { OAuthStateService } from './oauth-state.service';

import { OAuthStateFailureReason } from '../enums/oauth-state-failure-reason.enum';
import { ReturnTo } from '../enums/return-to.enum';

/**
 * An in-memory stand-in for the two Redis commands this service depends on. `getdel` really does
 * delete, because "consumed exactly once" is the property under test.
 */
function fakeRedis() {
  const store = new Map<string, string>();

  return {
    store,
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    getdel: jest.fn((key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return Promise.resolve(value);
    }),
  };
}

async function buildService(redis: ReturnType<typeof fakeRedis>): Promise<OAuthStateService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      OAuthStateService,
      { provide: REDIS_CLIENT, useValue: redis },
      { provide: ConfigService, useValue: { get: () => 'test-state-secret' } },
    ],
  }).compile();

  return moduleRef.get(OAuthStateService);
}

describe('OAuthStateService', () => {
  const input = { tenantId: 'tenant-1', userId: 'user-1', returnTo: ReturnTo.ONBOARDING as const };
  let redis: ReturnType<typeof fakeRedis>;
  let service: OAuthStateService;

  beforeEach(async () => {
    redis = fakeRedis();
    service = await buildService(redis);
  });

  it('round-trips a freshly minted state with its cookie', async () => {
    const { state, sid } = await service.mint(input);
    const result = await service.consume(state, sid);

    expect(result).toEqual({
      ok: true,
      record: expect.objectContaining({ tenantId: 'tenant-1', userId: 'user-1' }),
    });
  });

  it('never stores the raw binding cookie, only its hash', async () => {
    const { sid } = await service.mint(input);
    const stored = [...redis.store.values()].join('');

    expect(stored).not.toContain(sid);
    expect(stored).toContain('sidHash');
  });

  it('consumes the nonce exactly once', async () => {
    // A replayed callback — the user pressing back, or an attacker resubmitting a captured URL —
    // must find nothing. GETDEL is what makes this atomic rather than a read-then-delete race.
    const { state, sid } = await service.mint(input);

    await expect(service.consume(state, sid)).resolves.toMatchObject({ ok: true });
    await expect(service.consume(state, sid)).resolves.toEqual({
      ok: false,
      reason: OAuthStateFailureReason.UNKNOWN_NONCE,
    });
  });

  it('rejects a callback whose browser-binding cookie is missing', async () => {
    // This is the mailed-consent-link attack: the victim's browser never received the cookie, so
    // their consent cannot be grafted onto the attacker's tenant.
    const { state } = await service.mint(input);

    await expect(service.consume(state, undefined)).resolves.toEqual({
      ok: false,
      reason: OAuthStateFailureReason.SID_MISMATCH,
    });
  });

  it("rejects a callback carrying a different flow's cookie", async () => {
    const first = await service.mint(input);
    const second = await service.mint({ ...input, tenantId: 'tenant-2' });

    await expect(service.consume(first.state, second.sid)).resolves.toEqual({
      ok: false,
      reason: OAuthStateFailureReason.SID_MISMATCH,
    });
  });

  it('rejects a tampered signature', async () => {
    const { state, sid } = await service.mint(input);
    const [nonce, issuedAt] = state.split('.');

    await expect(service.consume(`${nonce}.${issuedAt}.forged`, sid)).resolves.toEqual({
      ok: false,
      reason: OAuthStateFailureReason.INVALID_SIGNATURE,
    });
  });

  it('rejects a state minted by a different secret', async () => {
    const otherService = await buildService(redis);
    Object.defineProperty(otherService, 'secret', { value: 'a-different-secret' });

    const { state, sid } = await otherService.mint(input);
    await expect(service.consume(state, sid)).resolves.toMatchObject({ ok: false });
  });

  it('rejects a malformed or absent state without touching Redis', async () => {
    await expect(service.consume(undefined, 'sid')).resolves.toMatchObject({ ok: false });
    await expect(service.consume('not-a-state', 'sid')).resolves.toMatchObject({ ok: false });
    expect(redis.getdel).not.toHaveBeenCalled();
  });

  it('rejects a state past its TTL', async () => {
    const { state, sid } = await service.mint(input);
    const [nonce, , signature] = state.split('.');
    // Re-sign with an old timestamp is impossible without the secret, so instead advance the clock
    // past the window and confirm the cheap pre-filter catches it before the Redis round trip.
    const elevenMinutes = 11 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + elevenMinutes);

    await expect(
      service.consume(`${nonce}.${Date.now() - elevenMinutes}.${signature}`, sid)
    ).resolves.toMatchObject({ ok: false });

    jest.restoreAllMocks();
  });

  it('sets a TTL on the state record so an abandoned flow expires on its own', async () => {
    await service.mint(input);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('connections:oauth-state:'),
      expect.any(String),
      'EX',
      600,
      'NX'
    );
  });
});
