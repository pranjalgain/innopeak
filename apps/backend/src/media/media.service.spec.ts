import { MediaRepository } from '@db/repositories/media/media.repository';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { MediaFile } from './interfaces/media.interface';
import { StorageProviderType } from './interfaces/media.interface';
import { MediaService } from './media.service';
import { StorageProvider } from './providers/storage.provider';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'fixed-uuid') }));

const mockMediaFile: MediaFile = {
  id: 'media-id-1',
  userId: 'user-id-1',
  filename: 'media/2026/07/fixed-uuid-file.png',
  originalName: 'file.png',
  mimeType: 'image/png',
  size: '1024',
  storageProvider: StorageProviderType.S3,
  storageKey: 'media/2026/07/fixed-uuid-file.png',
  url: 'https://example.com/file.png',
  thumbnailUrl: null,
  metadata: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

const mockFile: Express.Multer.File = {
  fieldname: 'file',
  originalname: 'file.png',
  encoding: '7bit',
  mimetype: 'image/png',
  size: 1024,
  buffer: Buffer.from('test'),
  destination: '',
  filename: '',
  path: '',
  stream: undefined as unknown as Express.Multer.File['stream'],
};

describe('MediaService', () => {
  let target: MediaService;
  let mediaRepository: {
    create: jest.Mock;
    findById: jest.Mock;
    findByUserId: jest.Mock;
    delete: jest.Mock;
  };
  let storageProvider: { upload: jest.Mock; delete: jest.Mock; getSignedUrl: jest.Mock };

  beforeEach(async () => {
    mediaRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      delete: jest.fn(),
    };
    storageProvider = {
      upload: jest.fn(),
      delete: jest.fn(),
      getSignedUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: MediaRepository, useValue: mediaRepository },
        { provide: StorageProvider, useValue: storageProvider },
      ],
    }).compile();

    target = module.get(MediaService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('uploads the file via the storage provider and persists the record', async () => {
      storageProvider.upload.mockResolvedValue({
        storageKey: mockMediaFile.storageKey,
        url: mockMediaFile.url,
        thumbnailUrl: mockMediaFile.thumbnailUrl,
      });
      mediaRepository.create.mockResolvedValue(mockMediaFile);

      const result = await target.upload('user-id-1', mockFile, { tag: 'avatar' });

      expect(storageProvider.upload).toHaveBeenCalledWith(
        mockFile,
        expect.stringMatching(/^media\/\d{4}\/\d{2}\/fixed-uuid-file\.png$/)
      );
      expect(mediaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-id-1',
          originalName: mockFile.originalname,
          mimeType: mockFile.mimetype,
          size: String(mockFile.size),
          storageKey: mockMediaFile.storageKey,
          url: mockMediaFile.url,
          thumbnailUrl: mockMediaFile.thumbnailUrl,
          metadata: { tag: 'avatar' },
        })
      );
      expect(result).toEqual(mockMediaFile);
    });

    it('defaults metadata to null when not provided', async () => {
      storageProvider.upload.mockResolvedValue({
        storageKey: mockMediaFile.storageKey,
        url: mockMediaFile.url,
        thumbnailUrl: null,
      });
      mediaRepository.create.mockResolvedValue(mockMediaFile);

      await target.upload('user-id-1', mockFile);

      expect(mediaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null })
      );
    });

    it('sanitizes the original filename to prevent path traversal', async () => {
      storageProvider.upload.mockResolvedValue({
        storageKey: 'key',
        url: 'url',
        thumbnailUrl: null,
      });
      mediaRepository.create.mockResolvedValue(mockMediaFile);

      const maliciousFile = { ...mockFile, originalname: '../../etc/passwd' };

      await target.upload('user-id-1', maliciousFile);

      const [, storageKeyArg] = storageProvider.upload.mock.calls[0] as [unknown, string];
      expect(storageKeyArg).toMatch(/^media\/\d{4}\/\d{2}\/fixed-uuid-\.\._\.\._etc_passwd$/);
    });

    it('derives storageProvider name S3 from the injected provider constructor', async () => {
      class S3StorageProviderStub {
        upload = jest.fn().mockResolvedValue({ storageKey: 'k', url: 'u', thumbnailUrl: null });
        delete = jest.fn();
        getSignedUrl = jest.fn();
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MediaService,
          { provide: MediaRepository, useValue: mediaRepository },
          { provide: StorageProvider, useValue: new S3StorageProviderStub() },
        ],
      }).compile();
      const service = module.get(MediaService);
      mediaRepository.create.mockResolvedValue(mockMediaFile);

      await service.upload('user-id-1', mockFile);

      expect(mediaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ storageProvider: StorageProviderType.S3 })
      );
    });

    it('derives storageProvider name Cloudinary from the injected provider constructor', async () => {
      class CloudinaryStorageProviderStub {
        upload = jest.fn().mockResolvedValue({ storageKey: 'k', url: 'u', thumbnailUrl: null });
        delete = jest.fn();
        getSignedUrl = jest.fn();
      }

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MediaService,
          { provide: MediaRepository, useValue: mediaRepository },
          { provide: StorageProvider, useValue: new CloudinaryStorageProviderStub() },
        ],
      }).compile();
      const service = module.get(MediaService);
      mediaRepository.create.mockResolvedValue(mockMediaFile);

      await service.upload('user-id-1', mockFile);

      expect(mediaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ storageProvider: StorageProviderType.CLOUDINARY })
      );
    });

    it('defaults storageProvider name to LOCAL for unrecognized providers', async () => {
      mediaRepository.create.mockResolvedValue(mockMediaFile);
      storageProvider.upload.mockResolvedValue({ storageKey: 'k', url: 'u', thumbnailUrl: null });

      await target.upload('user-id-1', mockFile);

      expect(mediaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ storageProvider: StorageProviderType.LOCAL })
      );
    });
  });

  describe('getById', () => {
    it('returns the media file when found', async () => {
      mediaRepository.findById.mockResolvedValue(mockMediaFile);

      const result = await target.getById(mockMediaFile.id);

      expect(result).toEqual(mockMediaFile);
      expect(mediaRepository.findById).toHaveBeenCalledWith(mockMediaFile.id);
    });

    it('throws NotFoundException when not found', async () => {
      mediaRepository.findById.mockResolvedValue(null);

      await expect(target.getById('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByUserId', () => {
    it('delegates to the repository with pagination params', async () => {
      const paginated = { data: [mockMediaFile], total: 1 };
      mediaRepository.findByUserId.mockResolvedValue(paginated);

      const result = await target.getByUserId('user-id-1', 1, 20);

      expect(mediaRepository.findByUserId).toHaveBeenCalledWith('user-id-1', 1, 20);
      expect(result).toEqual(paginated);
    });
  });

  describe('delete', () => {
    it('deletes the file from storage and the DB record when owned by the user', async () => {
      mediaRepository.findById.mockResolvedValue(mockMediaFile);

      await target.delete(mockMediaFile.id, mockMediaFile.userId);

      expect(storageProvider.delete).toHaveBeenCalledWith(mockMediaFile.storageKey);
      expect(mediaRepository.delete).toHaveBeenCalledWith(mockMediaFile.id);
    });

    it('throws NotFoundException when the media file does not exist', async () => {
      mediaRepository.findById.mockResolvedValue(null);

      await expect(target.delete('missing-id', 'user-id-1')).rejects.toThrow(NotFoundException);
      expect(storageProvider.delete).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the user does not own the media file', async () => {
      mediaRepository.findById.mockResolvedValue(mockMediaFile);

      await expect(target.delete(mockMediaFile.id, 'other-user')).rejects.toThrow(
        ForbiddenException
      );
      expect(storageProvider.delete).not.toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    it('returns a signed url when the user owns the media file', async () => {
      mediaRepository.findById.mockResolvedValue(mockMediaFile);
      storageProvider.getSignedUrl.mockResolvedValue('https://signed.example.com/file.png');

      const result = await target.getSignedUrl(mockMediaFile.id, mockMediaFile.userId);

      expect(storageProvider.getSignedUrl).toHaveBeenCalledWith(mockMediaFile.storageKey, 3600);
      expect(result).toBe('https://signed.example.com/file.png');
    });

    it('throws NotFoundException when the media file does not exist', async () => {
      mediaRepository.findById.mockResolvedValue(null);

      await expect(target.getSignedUrl('missing-id', 'user-id-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException when the user does not own the media file', async () => {
      mediaRepository.findById.mockResolvedValue(mockMediaFile);

      await expect(target.getSignedUrl(mockMediaFile.id, 'other-user')).rejects.toThrow(
        ForbiddenException
      );
    });
  });
});
