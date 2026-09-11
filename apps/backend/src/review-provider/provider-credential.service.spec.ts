import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { ProviderCredentialService } from './provider-credential.service';
import { CredentialStoreProvider } from './providers/credential-store.provider';
import { ReviewProvider } from './providers/review-provider.provider';
import type { ProviderTokenSet } from './types/review-provider.type';

const tokens: ProviderTokenSet = {
  accessToken: 'fresh-access-token',
  refreshToken: 'fresh-refresh-token',
  expiresAt: new Date(Date.now() + 3600_000),
};

/**
 * `disconnect()` schedules the old credential for deletion — the AWS store gives it a 7-day
 * recovery window rather than purging it immediately. An owner reconnecting the *same* Google
 * account inside that window hits the same `credential_reference`, and AWS Secrets Manager refuses
 * `PutSecretValue` against a secret pending deletion. Without a fallback, that owner could not
 * reconnect their own account at all for up to 7 days.
 */
describe('ProviderCredentialService.replaceCredential', () => {
  let service: ProviderCredentialService;
  const get = jest.fn();
  const update = jest.fn();
  const put = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    get.mockResolvedValue({ refreshToken: 'old-refresh-token' });
    put.mockResolvedValue('local-redis:fresh-secret-id');

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProviderCredentialService,
        { provide: ReviewProvider, useValue: {} },
        { provide: CredentialStoreProvider, useValue: { get, update, put, delete: jest.fn() } },
        { provide: REDIS_CLIENT, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ProviderCredentialService);
  });

  it('keeps the same reference on an ordinary reconnect (the common case)', async () => {
    update.mockResolvedValue(undefined);

    const result = await service.replaceCredential('local-redis:old-secret-id', tokens);

    expect(result).toBe('local-redis:old-secret-id');
    expect(put).not.toHaveBeenCalled();
  });

  it('mints a fresh secret and returns its reference when the old one refuses the write', async () => {
    // The exact failure mode: AWS Secrets Manager's InvalidRequestException on a secret pending
    // deletion from a disconnect within the last 7 days.
    update.mockRejectedValue(new Error('InvalidRequestException: pending deletion'));

    const result = await service.replaceCredential('aws-sm:tenant-1/connection', tokens);

    expect(result).toBe('local-redis:fresh-secret-id');
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: tokens.refreshToken })
    );
  });

  it('carries the old refresh token into the fresh secret when the new tokens omit one', async () => {
    // Google omits refresh_token on every response except the first consent — a genuine
    // reconnect always gets one, but the merge logic must still be exercised, not bypassed, on
    // the fallback path.
    update.mockRejectedValue(new Error('pending deletion'));
    const tokensWithNoRefresh: ProviderTokenSet = {
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    };

    await service.replaceCredential('aws-sm:tenant-1/connection', tokensWithNoRefresh);

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'old-refresh-token' })
    );
  });

  it('still falls back even when the pre-read of the old secret also fails', async () => {
    get.mockRejectedValue(new Error('ResourceNotFoundException'));
    update.mockRejectedValue(new Error('InvalidRequestException'));

    const result = await service.replaceCredential('aws-sm:tenant-1/connection', tokens);

    expect(result).toBe('local-redis:fresh-secret-id');
  });
});

/**
 * `refreshUnderLock` falls through to refreshing anyway when it never acquired the lock and the
 * concurrent-refresh wait times out (the holder crashed, or is just slower than the wait window) —
 * safe, since Google's refresh tokens are reusable. But the `finally` block used to delete the
 * lock unconditionally, including on this exact fallthrough path — deleting a lock this call never
 * held, which belongs to whichever other call *did* acquire it and may still be mid-refresh. A
 * third caller could then acquire the freed lock and start a redundant third refresh, exactly what
 * the lock exists to prevent.
 */
describe('ProviderCredentialService.resolveAccessToken — lock release', () => {
  let service: ProviderCredentialService;
  const refreshAccessToken = jest.fn();
  const get = jest.fn();
  const update = jest.fn();
  const redisSet = jest.fn();
  const redisGet = jest.fn();
  const redisDel = jest.fn();

  const input = {
    connectionId: 'connection-1',
    credentialReference: 'local-redis:secret-1',
    tokenExpiresAt: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    get.mockResolvedValue({ refreshToken: 'stored-refresh-token' });
    update.mockResolvedValue(undefined);
    refreshAccessToken.mockResolvedValue(tokens);
    redisDel.mockResolvedValue(1);
    // No cached access token at `resolveAccessToken`'s own read, and `awaitConcurrentRefresh`'s
    // polling reads never find one either — the concurrent holder never finishes within the wait
    // window, so the fallthrough path is what actually runs.
    redisGet.mockResolvedValue(null);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProviderCredentialService,
        { provide: ReviewProvider, useValue: { refreshAccessToken } },
        { provide: CredentialStoreProvider, useValue: { get, update, put: jest.fn() } },
        {
          provide: REDIS_CLIENT,
          useValue: { set: redisSet, get: redisGet, del: redisDel },
        },
      ],
    }).compile();

    service = moduleRef.get(ProviderCredentialService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not delete the refresh lock when it never acquired it', async () => {
    redisSet.mockResolvedValue(null); // NX lost — someone else already holds the lock

    const resultPromise = service.resolveAccessToken(input);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.accessToken).toBe(tokens.accessToken);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('still deletes the lock on the ordinary path where it did acquire it', async () => {
    redisSet.mockResolvedValue('OK'); // NX won — this call owns the lock

    const result = await service.resolveAccessToken(input);

    expect(result.accessToken).toBe(tokens.accessToken);
    expect(redisDel).toHaveBeenCalledTimes(1);
  });
});
