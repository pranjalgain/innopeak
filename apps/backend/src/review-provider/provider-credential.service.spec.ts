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

// Regression: a secret pending deletion (7-day window after disconnect) refuses writes, which blocked reconnecting the same Google account.
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
    // Secrets Manager's InvalidRequestException on a secret pending deletion.
    update.mockRejectedValue(new Error('InvalidRequestException: pending deletion'));

    const result = await service.replaceCredential('aws-sm:tenant-1/connection', tokens);

    expect(result).toBe('local-redis:fresh-secret-id');
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: tokens.refreshToken })
    );
  });

  it('carries the old refresh token into the fresh secret when the new tokens omit one', async () => {
    // Google omits refresh_token after the first consent; the merge must still run on the fallback path.
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

// Regression: the finally block deleted the lock even when this call never acquired it, letting a third refresh start.
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
    // Never a cached token, so the concurrent holder never finishes within the wait and the fallthrough path runs.
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

  it('drops the cached access token for the connection, and survives Redis failing', async () => {
    await service.invalidateAccessToken('connection-1');
    expect(redisDel).toHaveBeenCalledWith('review-credentials:access-token:connection-1');

    redisDel.mockRejectedValueOnce(new Error('redis down'));
    await expect(service.invalidateAccessToken('connection-1')).resolves.toBeUndefined();
  });

  it('does not delete the refresh lock when it never acquired it', async () => {
    redisSet.mockResolvedValue(null); // NX lost

    const resultPromise = service.resolveAccessToken(input);
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.accessToken).toBe(tokens.accessToken);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('still deletes the lock on the ordinary path where it did acquire it', async () => {
    redisSet.mockResolvedValue('OK'); // NX won

    const result = await service.resolveAccessToken(input);

    expect(result.accessToken).toBe(tokens.accessToken);
    expect(redisDel).toHaveBeenCalledTimes(1);
  });
});

describe('ProviderCredentialService.revokeOrThrow', () => {
  let service: ProviderCredentialService;
  const get = jest.fn();
  const del = jest.fn();
  const revoke = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    del.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProviderCredentialService,
        { provide: ReviewProvider, useValue: { revoke } },
        {
          provide: CredentialStoreProvider,
          useValue: { get, update: jest.fn(), put: jest.fn(), delete: del },
        },
        { provide: REDIS_CLIENT, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ProviderCredentialService);
  });

  it('revokes at Google and then deletes the stored credential', async () => {
    get.mockResolvedValue({ refreshToken: 'rt' });
    revoke.mockResolvedValue(true);

    await expect(service.revokeOrThrow('ref')).resolves.toBeUndefined();

    expect(revoke).toHaveBeenCalledWith('rt');
    expect(del).toHaveBeenCalledWith('ref');
  });

  it('throws and keeps the credential when Google does not confirm, so the purge can retry', async () => {
    get.mockResolvedValue({ refreshToken: 'rt' });
    revoke.mockResolvedValue(false);

    await expect(service.revokeOrThrow('ref')).rejects.toThrow('did not confirm');
    expect(del).not.toHaveBeenCalled();
  });

  it('has nothing to release for a credential that is already gone or holds no refresh token', async () => {
    get.mockResolvedValueOnce(null).mockResolvedValueOnce({});

    await expect(service.revokeOrThrow('ref')).resolves.toBeUndefined();
    await expect(service.revokeOrThrow('ref')).resolves.toBeUndefined();

    expect(revoke).not.toHaveBeenCalled();
  });
});

// Deleting the credential when Google refused to confirm the revocation left a live grant at Google with no handle left to revoke it by.
describe('ProviderCredentialService.revokeAndDelete', () => {
  let service: ProviderCredentialService;
  const get = jest.fn();
  const del = jest.fn();
  const revoke = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    del.mockResolvedValue(undefined);
    get.mockResolvedValue({ refreshToken: 'rt' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProviderCredentialService,
        { provide: ReviewProvider, useValue: { revoke } },
        {
          provide: CredentialStoreProvider,
          useValue: { get, update: jest.fn(), put: jest.fn(), delete: del },
        },
        { provide: REDIS_CLIENT, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ProviderCredentialService);
  });

  it('revokes and deletes when Google confirms', async () => {
    revoke.mockResolvedValue(true);

    await expect(service.revokeAndDelete('ref', { keepIfNotRevoked: true })).resolves.toBe(true);

    expect(del).toHaveBeenCalledWith('ref');
  });

  it('keeps the credential, and says so, when Google does not confirm and the caller asked to keep it', async () => {
    revoke.mockResolvedValue(false);

    await expect(service.revokeAndDelete('ref', { keepIfNotRevoked: true })).resolves.toBe(false);

    expect(del).not.toHaveBeenCalled();
  });

  it('still deletes when Google does not confirm and the caller did not ask to keep it', async () => {
    revoke.mockResolvedValue(false);

    await expect(service.revokeAndDelete('ref')).resolves.toBe(false);

    expect(del).toHaveBeenCalledWith('ref');
  });

  it('deletes a credential that holds no refresh token, whatever the option', async () => {
    get.mockResolvedValue({});

    await service.revokeAndDelete('ref', { keepIfNotRevoked: true });

    expect(revoke).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith('ref');
  });

  it('never throws, even when the store does', async () => {
    get.mockRejectedValue(new Error('store down'));

    await expect(service.revokeAndDelete('ref', { keepIfNotRevoked: true })).resolves.toBe(false);
  });
});
