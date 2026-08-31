import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { v2 as cloudinary } from 'cloudinary';

import { CloudinaryStorageProvider } from './cloudinary.provider';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
    url: jest.fn(),
    utils: {
      private_download_url: jest.fn(),
    },
  },
}));

const mockCloudinary = cloudinary as unknown as {
  config: jest.Mock;
  uploader: { upload_stream: jest.Mock; destroy: jest.Mock };
  url: jest.Mock;
  utils: { private_download_url: jest.Mock };
};

function buildFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 2048,
    buffer: Buffer.from('binary-data'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as unknown as Express.Multer.File['stream'],
    ...overrides,
  };
}

describe('CloudinaryStorageProvider', () => {
  let target: CloudinaryStorageProvider;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = { get: jest.fn().mockReturnValue('config-value') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CloudinaryStorageProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(CloudinaryStorageProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('configures the cloudinary SDK with credentials from config', () => {
      expect(mockCloudinary.config).toHaveBeenCalledWith({
        cloud_name: 'config-value',
        api_key: 'config-value',
        api_secret: 'config-value',
        secure: true,
      });
    });
  });

  describe('upload', () => {
    it('uploads via upload_stream and maps the result, generating a thumbnail for images', async () => {
      const endMock = jest.fn();
      mockCloudinary.uploader.upload_stream.mockImplementation((_options, callback) => {
        callback(null, { public_id: 'media/2026/file', secure_url: 'https://cdn/file.png' });
        return { end: endMock };
      });
      mockCloudinary.url.mockReturnValue('https://cdn/file-thumb.png');

      const file = buildFile();
      const result = await target.upload(file, 'media/2026/file');

      expect(mockCloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        expect.objectContaining({
          public_id: 'media/2026/file',
          resource_type: 'auto',
          folder: 'media/2026',
        }),
        expect.any(Function)
      );
      expect(endMock).toHaveBeenCalledWith(file.buffer);
      expect(mockCloudinary.url).toHaveBeenCalledWith('media/2026/file', {
        width: 200,
        height: 200,
        crop: 'thumb',
        fetch_format: 'auto',
      });
      expect(result).toEqual({
        storageKey: 'media/2026/file',
        url: 'https://cdn/file.png',
        thumbnailUrl: 'https://cdn/file-thumb.png',
      });
    });

    it('omits the folder option when the key has no path separator', async () => {
      mockCloudinary.uploader.upload_stream.mockImplementation((_options, callback) => {
        callback(null, { public_id: 'file', secure_url: 'https://cdn/file.png' });
        return { end: jest.fn() };
      });

      await target.upload(buildFile(), 'file');

      expect(mockCloudinary.uploader.upload_stream).toHaveBeenCalledWith(
        { public_id: 'file', resource_type: 'auto' },
        expect.any(Function)
      );
    });

    it('does not generate a thumbnail for non-image mime types', async () => {
      mockCloudinary.uploader.upload_stream.mockImplementation((_options, callback) => {
        callback(null, { public_id: 'media/doc', secure_url: 'https://cdn/doc.pdf' });
        return { end: jest.fn() };
      });

      const result = await target.upload(buildFile({ mimetype: 'application/pdf' }), 'media/doc');

      expect(mockCloudinary.url).not.toHaveBeenCalled();
      expect(result.thumbnailUrl).toBeNull();
    });

    it('rejects with a wrapped error when the SDK reports an error', async () => {
      mockCloudinary.uploader.upload_stream.mockImplementation((_options, callback) => {
        callback({ message: 'network failure' }, undefined);
        return { end: jest.fn() };
      });

      await expect(target.upload(buildFile(), 'media/file')).rejects.toThrow('network failure');
    });

    it('rejects when the SDK returns no result and no error', async () => {
      mockCloudinary.uploader.upload_stream.mockImplementation((_options, callback) => {
        callback(null, undefined);
        return { end: jest.fn() };
      });

      await expect(target.upload(buildFile(), 'media/file')).rejects.toThrow(
        'Cloudinary upload returned no result'
      );
    });
  });

  describe('delete', () => {
    it('destroys the file by key with invalidation', async () => {
      mockCloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

      await target.delete('media/2026/file');

      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('media/2026/file', {
        invalidate: true,
      });
    });

    it('propagates errors from the SDK', async () => {
      mockCloudinary.uploader.destroy.mockRejectedValue(new Error('destroy failed'));

      await expect(target.delete('media/2026/file')).rejects.toThrow('destroy failed');
    });
  });

  describe('getSignedUrl', () => {
    it('returns a private download url with an expiry timestamp', async () => {
      mockCloudinary.utils.private_download_url.mockReturnValue('https://cdn/signed-url');

      const result = await target.getSignedUrl('media/2026/file', 3600);

      expect(mockCloudinary.utils.private_download_url).toHaveBeenCalledWith(
        'media/2026/file',
        '',
        expect.objectContaining({ type: 'authenticated', expires_at: expect.any(Number) })
      );
      expect(result).toBe('https://cdn/signed-url');
    });
  });
});
