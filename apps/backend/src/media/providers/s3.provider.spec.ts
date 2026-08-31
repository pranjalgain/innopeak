import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { S3StorageProvider } from './s3.provider';

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(input => ({ __type: 'PutObjectCommand', input })),
  DeleteObjectCommand: jest.fn(input => ({ __type: 'DeleteObjectCommand', input })),
  GetObjectCommand: jest.fn(input => ({ __type: 'GetObjectCommand', input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

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

describe('S3StorageProvider', () => {
  let target: S3StorageProvider;
  let configService: { get: jest.Mock };
  let sendMock: jest.Mock;

  beforeEach(async () => {
    sendMock = jest.fn();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send: sendMock }));

    configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          AWS_S3_REGION: 'us-east-1',
          AWS_S3_BUCKET: 'my-bucket',
          AWS_ACCESS_KEY_ID: 'access-key',
          AWS_SECRET_ACCESS_KEY: 'secret-key',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [S3StorageProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(S3StorageProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('creates the S3 client using config-derived credentials and region', () => {
      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' },
      });
    });

    it('falls back to default region and empty bucket/credentials when config is missing', async () => {
      const emptyConfigService = { get: jest.fn().mockReturnValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [S3StorageProvider, { provide: ConfigService, useValue: emptyConfigService }],
      }).compile();
      module.get(S3StorageProvider);

      expect(S3Client).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: { accessKeyId: '', secretAccessKey: '' },
      });
    });
  });

  describe('upload', () => {
    it('puts the object and returns the public S3 url', async () => {
      sendMock.mockResolvedValue({});
      const file = buildFile();

      const result = await target.upload(file, 'media/2026/file.png');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'media/2026/file.png',
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        Metadata: { originalName: file.originalname },
      });
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ __type: 'PutObjectCommand' })
      );
      expect(result).toEqual({
        storageKey: 'media/2026/file.png',
        url: 'https://my-bucket.s3.us-east-1.amazonaws.com/media/2026/file.png',
        thumbnailUrl: null,
      });
    });

    it('propagates errors from the S3 client', async () => {
      sendMock.mockRejectedValue(new Error('s3 unavailable'));

      await expect(target.upload(buildFile(), 'media/2026/file.png')).rejects.toThrow(
        's3 unavailable'
      );
    });
  });

  describe('delete', () => {
    it('sends a delete command for the given key', async () => {
      sendMock.mockResolvedValue({});

      await target.delete('media/2026/file.png');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'media/2026/file.png',
      });
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ __type: 'DeleteObjectCommand' })
      );
    });

    it('propagates errors from the S3 client', async () => {
      sendMock.mockRejectedValue(new Error('delete failed'));

      await expect(target.delete('media/2026/file.png')).rejects.toThrow('delete failed');
    });
  });

  describe('getSignedUrl', () => {
    it('returns a presigned url for the given key and expiry', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example.com/file.png');

      const result = await target.getSignedUrl('media/2026/file.png', 900);

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'my-bucket',
        Key: 'media/2026/file.png',
      });
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ send: sendMock }),
        expect.objectContaining({ __type: 'GetObjectCommand' }),
        { expiresIn: 900 }
      );
      expect(result).toBe('https://signed.example.com/file.png');
    });

    it('propagates errors from the presigner', async () => {
      (getSignedUrl as jest.Mock).mockRejectedValue(new Error('presign failed'));

      await expect(target.getSignedUrl('media/2026/file.png', 900)).rejects.toThrow(
        'presign failed'
      );
    });
  });
});
