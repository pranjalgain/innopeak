import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { MediaDbService } from './media.db-service';
import { MediaRepository } from './media.repository';
import type { MediaRow } from './types/media.type';

describe('MediaDbService', () => {
  let target: MediaDbService;
  let mediaRepository: jest.Mocked<MediaRepository>;

  const owner = { userId: 'user-1' } as const;

  function row(overrides: Partial<MediaRow> = {}): MediaRow {
    return {
      id: 'media-1',
      kind: 'avatar',
      provider: 'cloudinary',
      providerAssetId: 'avatars/users/user-1/asset-1',
      url: 'https://res.cloudinary.com/demo/avatars/users/user-1/asset-1.png',
      mimeType: 'image/png',
      sizeBytes: 123,
      ...overrides,
    };
  }

  function asset(providerAssetId: string, provider = 'cloudinary') {
    return {
      provider,
      providerAssetId,
      url: `https://res.cloudinary.com/demo/${providerAssetId}.png`,
      mimeType: 'image/png',
      sizeBytes: 123,
    };
  }

  beforeEach(async () => {
    mediaRepository = {
      findAvatar: jest.fn(),
      upsertAvatar: jest.fn(),
      deleteAvatar: jest.fn(),
    } as unknown as jest.Mocked<MediaRepository>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaDbService, { provide: MediaRepository, useValue: mediaRepository }],
    }).compile();

    target = module.get(MediaDbService);
  });

  describe('upsertAvatar', () => {
    it('reports no previous asset for a first-ever upload', async () => {
      mediaRepository.upsertAvatar.mockResolvedValue({ row: row(), replaced: null });

      const result = await target.upsertAvatar(owner, asset('avatars/users/user-1/asset-1'));

      expect(result.previousAsset).toBeNull();
    });

    it('reports the displaced asset when the confirmed id is a different one', async () => {
      mediaRepository.upsertAvatar.mockResolvedValue({
        row: row({ providerAssetId: 'avatars/users/user-1/new' }),
        replaced: { provider: 'cloudinary', providerAssetId: 'avatars/users/user-1/old' },
      });

      const result = await target.upsertAvatar(owner, asset('avatars/users/user-1/new'));

      expect(result.previousAsset).toEqual({
        provider: 'cloudinary',
        providerAssetId: 'avatars/users/user-1/old',
      });
    });

    /**
     * Regression: `previousAsset` used to be reported for any pre-existing row, so re-confirming
     * the id the row already held made the caller delete the asset it had just saved — the request
     * answered 200 "Avatar updated" while the stored `url` became a permanent 404. Reproduced live
     * against Cloudinary before the fix.
     */
    it('reports no previous asset when the confirmed id is the one the row already holds', async () => {
      const unchanged = 'avatars/users/user-1/asset-1';
      mediaRepository.upsertAvatar.mockResolvedValue({
        row: row({ providerAssetId: unchanged }),
        replaced: { provider: 'cloudinary', providerAssetId: unchanged },
      });

      const result = await target.upsertAvatar(owner, asset(unchanged));

      expect(result.previousAsset).toBeNull();
    });

    it('still reports the previous asset when only the provider changed', async () => {
      const sameId = 'avatars/users/user-1/asset-1';
      mediaRepository.upsertAvatar.mockResolvedValue({
        row: row({ providerAssetId: sameId }),
        replaced: { provider: 'noop', providerAssetId: sameId },
      });

      const result = await target.upsertAvatar(owner, asset(sameId));

      expect(result.previousAsset).toEqual({ provider: 'noop', providerAssetId: sameId });
    });
  });

  describe('deleteAvatar', () => {
    it('passes through to the repository', async () => {
      mediaRepository.deleteAvatar.mockResolvedValue({
        provider: 'cloudinary',
        providerAssetId: 'avatars/users/user-1/asset-1',
      });

      const result = await target.deleteAvatar(owner);

      expect(mediaRepository.deleteAvatar).toHaveBeenCalledWith(owner);
      expect(result).toEqual({
        provider: 'cloudinary',
        providerAssetId: 'avatars/users/user-1/asset-1',
      });
    });

    it('returns null when the owner had no avatar', async () => {
      mediaRepository.deleteAvatar.mockResolvedValue(null);

      await expect(target.deleteAvatar(owner)).resolves.toBeNull();
    });
  });
});
