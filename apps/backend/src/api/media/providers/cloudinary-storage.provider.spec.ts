import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

import { CloudinaryStorageProvider } from './cloudinary-storage.provider';

const mockResource = jest.fn<Promise<unknown>, [string, Record<string, unknown>]>();

// `api.resource` wraps `mockResource` in a closure rather than referencing it directly: the
// factory below runs at import time (jest hoists `jest.mock` above this file's own `const`
// declarations), before `mockResource` itself has been assigned — a direct reference would throw
// "Cannot access 'mockResource' before initialization". Deferring the lookup to call time (well
// after every test's `beforeEach` has run) sidesteps that.
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
    /**
     * The regression this guards: a real-world avatar upload — an AVIF photo from a modern phone
     * or browser — was rejected outright because the format allowlist only covered a handful of
     * older formats, even though Cloudinary itself accepted and stored the upload fine.
     */
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
});
