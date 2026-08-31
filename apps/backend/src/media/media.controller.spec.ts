import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { MediaFile } from './interfaces/media.interface';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

import type { AuthUser } from '../auth/interfaces/auth-user.interface';

const mockUser: AuthUser = {
  id: 'user-id-1',
  email: 'user@example.com',
  roles: ['user'],
  permissions: [],
};

const mockMediaFile: MediaFile = {
  id: 'media-id-1',
  userId: mockUser.id,
  filename: 'media/2026/07/uuid-file.png',
  originalName: 'file.png',
  mimeType: 'image/png',
  size: '1024',
  storageProvider: 's3',
  storageKey: 'media/2026/07/uuid-file.png',
  url: 'https://example.com/file.png',
  thumbnailUrl: null,
  metadata: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

describe('MediaController', () => {
  let target: MediaController;
  let mediaService: {
    upload: jest.Mock;
    getByUserId: jest.Mock;
    getById: jest.Mock;
    delete: jest.Mock;
    getSignedUrl: jest.Mock;
  };

  beforeEach(async () => {
    mediaService = {
      upload: jest.fn(),
      getByUserId: jest.fn(),
      getById: jest.fn(),
      delete: jest.fn(),
      getSignedUrl: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: mediaService }],
    }).compile();

    target = module.get(MediaController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('delegates to the service and maps the result to a DTO', async () => {
      mediaService.upload.mockResolvedValue(mockMediaFile);
      const file = { originalname: 'file.png' } as Express.Multer.File;

      const result = await target.upload(mockUser, file, { metadata: { tag: 'avatar' } });

      expect(mediaService.upload).toHaveBeenCalledWith(mockUser.id, file, { tag: 'avatar' });
      expect(result).toEqual(
        expect.objectContaining({ id: mockMediaFile.id, storageKey: mockMediaFile.storageKey })
      );
    });

    it('propagates errors raised by the service', async () => {
      mediaService.upload.mockRejectedValue(new Error('upload failed'));
      const file = { originalname: 'file.png' } as Express.Multer.File;

      await expect(target.upload(mockUser, file, {})).rejects.toThrow('upload failed');
    });
  });

  describe('list', () => {
    it('returns paginated media with computed meta', async () => {
      mediaService.getByUserId.mockResolvedValue({ data: [mockMediaFile], total: 21 });

      const result = await target.list(mockUser, 1, 20);

      expect(mediaService.getByUserId).toHaveBeenCalledWith(mockUser.id, 1, 20);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    });

    it('returns an empty list when the user has no media', async () => {
      mediaService.getByUserId.mockResolvedValue({ data: [], total: 0 });

      const result = await target.list(mockUser, 1, 20);

      expect(result.data).toEqual([]);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('getById', () => {
    it('returns the mapped media DTO', async () => {
      mediaService.getById.mockResolvedValue(mockMediaFile);

      const result = await target.getById(mockMediaFile.id);

      expect(mediaService.getById).toHaveBeenCalledWith(mockMediaFile.id);
      expect(result.id).toBe(mockMediaFile.id);
    });

    it('propagates a not-found error from the service', async () => {
      mediaService.getById.mockRejectedValue(new Error('not found'));

      await expect(target.getById('missing-id')).rejects.toThrow('not found');
    });
  });

  describe('remove', () => {
    it('deletes the media file and returns a success message', async () => {
      mediaService.delete.mockResolvedValue(undefined);

      const result = await target.remove(mockUser, mockMediaFile.id);

      expect(mediaService.delete).toHaveBeenCalledWith(mockMediaFile.id, mockUser.id);
      expect(result).toEqual({ message: 'Media deleted successfully' });
    });

    it('propagates errors raised by the service', async () => {
      mediaService.delete.mockRejectedValue(new Error('forbidden'));

      await expect(target.remove(mockUser, mockMediaFile.id)).rejects.toThrow('forbidden');
    });
  });

  describe('getSignedUrl', () => {
    it('returns the signed url from the service', async () => {
      mediaService.getSignedUrl.mockResolvedValue('https://signed.example.com/file.png');

      const result = await target.getSignedUrl(mockUser, mockMediaFile.id);

      expect(mediaService.getSignedUrl).toHaveBeenCalledWith(mockMediaFile.id, mockUser.id);
      expect(result).toEqual({ signedUrl: 'https://signed.example.com/file.png' });
    });

    it('propagates errors raised by the service', async () => {
      mediaService.getSignedUrl.mockRejectedValue(new Error('forbidden'));

      await expect(target.getSignedUrl(mockUser, mockMediaFile.id)).rejects.toThrow('forbidden');
    });
  });
});
