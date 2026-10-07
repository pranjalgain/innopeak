import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

import { CloudinaryStorageProvider } from './cloudinary-storage.provider';

import { StorageAssetNotFoundError } from '../types/storage-provider.type';

const mockResource = jest.fn<Promise<unknown>, [string, Record<string, unknown>]>();

// Closure, not a direct reference: jest hoists `jest.mock` above the `const`, so a direct
// reference would throw "Cannot access 'mockResource' before initialization".
jest.mock('cloudinary', () => {
  return {
    v2: {
      config: jest.fn(),
      utils: { api_sign_request: jest.fn() },
      api: {
        resource: (id: string, options: Record<string, unknown>): Promise<unknown> =>
          mockResource(id, options),
      },
      uploader: { destroy: jest.fn() },
    },
  };
});

describe('CloudinaryStorageProvider', () => {
  let target: CloudinaryStorageProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          CLOUDINARY_CLOUD_NAME: 'demo',
          CLOUDINARY_API_KEY: 'key',
          CLOUDINARY_API_SECRET: 'secret',
        };
        return values[key];
      }),
    } as unknown as ConfigService<EnvConfig>;

    target = new CloudinaryStorageProvider(configService);
  });

  describe('verifyUpload', () => {
    // Regression: AVIF avatar uploads were rejected by an allowlist of older formats only.
    it.each(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif', 'bmp'])(
      'accepts a "%s" asset landed in the expected folder',
      async format => {
        mockResource.mockResolvedValue({
          secure_url: `https://res.cloudinary.com/demo/avatars/asset-1.${format}`,
          format,
          bytes: 1024,
          asset_folder: 'avatars',
        });

        const result = await target.verifyUpload('avatars/asset-1', 'avatars');

        expect(result.ok).toBe(true);
        expect(result.ok && result.upload.mimeType.startsWith('image/')).toBe(true);
      }
    );

    it('rejects a genuinely unsupported format (e.g. an SVG, to avoid stored XSS) with reason "unsupportedFormat"', async () => {
      mockResource.mockResolvedValue({
        secure_url: 'https://res.cloudinary.com/demo/avatars/asset-1.svg',
        format: 'svg',
        bytes: 1024,
        asset_folder: 'avatars',
      });

      const result = await target.verifyUpload('avatars/asset-1', 'avatars');

      expect(result).toEqual({ ok: false, reason: 'unsupportedFormat' });
    });

    it('rejects an asset that landed in a different folder than expected with reason "notFound"', async () => {
      mockResource.mockResolvedValue({
        secure_url: 'https://res.cloudinary.com/demo/other/asset-1.png',
        format: 'png',
        bytes: 1024,
        asset_folder: 'other',
      });

      const result = await target.verifyUpload('other/asset-1', 'avatars');

      expect(result).toEqual({ ok: false, reason: 'notFound' });
    });

    it('rejects when the Cloudinary Admin API call itself fails (e.g. the asset never existed) with reason "notFound"', async () => {
      mockResource.mockRejectedValue(new Error('Resource not found'));

      const result = await target.verifyUpload('avatars/does-not-exist', 'avatars');

      expect(result).toEqual({ ok: false, reason: 'notFound' });
    });
  });

  describe('delete', () => {
    it('resolves on a confirmed deletion', async () => {
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({ result: 'ok' });

      await expect(target.delete('avatars/asset-1')).resolves.toBeUndefined();
    });

    // `uploader.destroy` resolves (not rejects) with 'not found'; callers treat "already gone" differently from other failures.
    it('throws StorageAssetNotFoundError when the asset no longer exists', async () => {
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({ result: 'not found' });

      await expect(target.delete('avatars/asset-1')).rejects.toThrow(StorageAssetNotFoundError);
    });

    it('throws a plain Error for any other non-"ok" result', async () => {
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({ result: 'error' });

      const rejection = target.delete('avatars/asset-1');
      await expect(rejection).rejects.toThrow(Error);
      await expect(rejection).rejects.not.toThrow(StorageAssetNotFoundError);
    });
  });
});
