import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { OAuthStateService } from './oauth-state.service';

import { OAUTH_STATE_TTL_SECONDS } from '../constants/connections.constants';
import { OAuthStateFailureReason } from '../enums/oauth-state-failure-reason.enum';
import { ReturnTo } from '../enums/return-to.enum';

/** In-memory stand-in for the Redis commands used; `getdel` really deletes since single use is under test. */
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
    // A replayed callback must find nothing; GETDEL makes that atomic.
    const { state, sid } = await service.mint(input);

    await expect(service.consume(state, sid)).resolves.toMatchObject({ ok: true });
    await expect(service.consume(state, sid)).resolves.toEqual({
      ok: false,
      reason: OAuthStateFailureReason.UNKNOWN_NONCE,
    });
  });

  it('rejects a callback whose browser-binding cookie is missing', async () => {
    // The mailed-consent-link attack: the victim's browser has no cookie, so consent can't be grafted onto the attacker's tenant.
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
    // The clock is advanced past the window and the real minted `state` reused: rebuilding it with a
    // recomputed timestamp would be flaky and yield INVALID_SIGNATURE instead of EXPIRED.
    const { state, sid } = await service.mint(input);
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + OAUTH_STATE_TTL_SECONDS * 1000 + 60_000);

    await expect(service.consume(state, sid)).resolves.toEqual({
      ok: false,
      reason: OAuthStateFailureReason.EXPIRED,
    });

    jest.restoreAllMocks();
  });

  /** Regression: `EXPIRED` was unreachable (collapsed into `null`); stale-but-signed must report it while forged still reports `INVALID_SIGNATURE`. */
  it('still reports INVALID_SIGNATURE, not EXPIRED, for a forged-but-timely state', async () => {
    const { sid } = await service.mint(input);

    await expect(
      service.consume(`some-nonce.${Date.now()}.forged-signature`, sid)
    ).resolves.toEqual({ ok: false, reason: OAuthStateFailureReason.INVALID_SIGNATURE });
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
