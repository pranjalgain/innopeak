import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { MediaDbService } from '@db/repositories/media/media.db-service';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { StorageNotConfiguredException } from './exceptions/media.exceptions';
import { MediaService } from './media.service';
import { StorageProvider } from './providers/storage.provider';
import { StorageAssetNotFoundError } from './types/storage-provider.type';

describe('MediaService', () => {
  let target: MediaService;
  let storageProvider: jest.Mocked<StorageProvider>;
  let mediaDbService: jest.Mocked<MediaDbService>;

  const tenantUser: AuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'jane@thecoffeehouse.com',
    role: UserRole.OWNER,
    locale: null,
  };

  const admin: AuthUser = {
    type: JwtTokenType.PLATFORM_ADMIN,
    id: 'admin-1',
    email: 'admin@innopeak.com',
    locale: null,
  };

  beforeEach(async () => {
    storageProvider = {
      type: 'cloudinary',
      isConfigured: jest.fn().mockReturnValue(true),
      createUploadAuthorization: jest.fn(),
      verifyUpload: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<StorageProvider>;

    mediaDbService = {
      findAvatarUrl: jest.fn(),
      findAvatarAsset: jest.fn(),
      upsertAvatar: jest.fn(),
      deleteAvatar: jest.fn(),
    } as unknown as jest.Mocked<MediaDbService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: StorageProvider, useValue: storageProvider },
        { provide: MediaDbService, useValue: mediaDbService },
      ],
    }).compile();

    target = module.get(MediaService);
  });

  describe('getAvatarUploadAuthorizationForTenant', () => {
    it('rejects a platform-admin token without minting an authorization', async () => {
      await expect(target.getAvatarUploadAuthorizationForTenant(admin)).rejects.toThrow(
        ForbiddenException
      );
      expect(storageProvider.createUploadAuthorization).not.toHaveBeenCalled();
    });

    it('mints an authorization for a tenant user', async () => {
      storageProvider.createUploadAuthorization.mockResolvedValue({
        provider: 'cloudinary',
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        formFields: { api_key: 'key', signature: 'sig' },
      });

      const result = await target.getAvatarUploadAuthorizationForTenant(tenantUser);

      expect(result).toMatchObject({ provider: 'cloudinary' });
    });

    /** Regression: the signed folder was a shared `avatars`, letting one owner confirm another's asset; `confirmAvatarFor*` below re-checks it. */
    it("signs an upload scoped to the tenant user's own folder", async () => {
      storageProvider.createUploadAuthorization.mockResolvedValue({
        provider: 'cloudinary',
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        formFields: {},
      });

      await target.getAvatarUploadAuthorizationForTenant(tenantUser);

      expect(storageProvider.createUploadAuthorization).toHaveBeenCalledWith({
        folder: 'avatars/users/user-1',
      });
    });
  });

  // Regression guard: without it an unconfigured server handed out an authorization for a blank cloud name.
  describe('when Cloudinary is not configured', () => {
    beforeEach(() => {
      storageProvider.isConfigured.mockReturnValue(false);
    });

    it('answers 503 instead of minting an upload authorization, for tenants and admins alike', async () => {
      await expect(target.getAvatarUploadAuthorizationForTenant(tenantUser)).rejects.toBeInstanceOf(
        StorageNotConfiguredException
      );
      await expect(target.getAvatarUploadAuthorizationForAdmin(admin)).rejects.toBeInstanceOf(
        StorageNotConfiguredException
      );
      expect(storageProvider.createUploadAuthorization).not.toHaveBeenCalled();
    });
  });

  describe('getAvatarUploadAuthorizationForAdmin', () => {
    it('rejects a tenant-user token without minting an authorization', async () => {
      await expect(target.getAvatarUploadAuthorizationForAdmin(tenantUser)).rejects.toThrow(
        ForbiddenException
      );
      expect(storageProvider.createUploadAuthorization).not.toHaveBeenCalled();
    });

    it('mints an authorization for a platform admin', async () => {
      storageProvider.createUploadAuthorization.mockResolvedValue({
        provider: 'cloudinary',
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        formFields: { api_key: 'key', signature: 'sig' },
      });

      const result = await target.getAvatarUploadAuthorizationForAdmin(admin);

      expect(result).toMatchObject({ provider: 'cloudinary' });
    });

    it("signs an upload scoped to the platform admin's own folder", async () => {
      storageProvider.createUploadAuthorization.mockResolvedValue({
        provider: 'cloudinary',
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/image/upload',
        formFields: {},
      });

      await target.getAvatarUploadAuthorizationForAdmin(admin);

      expect(storageProvider.createUploadAuthorization).toHaveBeenCalledWith({
        folder: 'avatars/platform-admins/admin-1',
      });
    });
  });

  describe('confirmAvatarForTenant', () => {
    it('rejects a platform-admin token, never writing a user-owned row with its id', async () => {
      await expect(target.confirmAvatarForTenant(admin, 'avatars/asset-1')).rejects.toThrow(
        ForbiddenException
      );
      expect(storageProvider.verifyUpload).not.toHaveBeenCalled();
      expect(mediaDbService.upsertAvatar).not.toHaveBeenCalled();
    });

    it('rejects with MESSAGES.AUTH.TENANT_ONLY specifically', async () => {
      await expect(target.confirmAvatarForTenant(admin, 'avatars/asset-1')).rejects.toThrow(
        MESSAGES.AUTH.TENANT_ONLY
      );
    });

    it('verifies and persists under the userId owner for a tenant user', async () => {
      storageProvider.verifyUpload.mockResolvedValue({
        ok: true,
        upload: {
          url: 'https://res.cloudinary.com/demo/avatars/user-1.png',
          mimeType: 'image/png',
          sizeBytes: 123,
        },
      });
      mediaDbService.upsertAvatar.mockResolvedValue({
        row: {
          id: 'media-1',
          kind: 'avatar',
          provider: 'cloudinary',
          providerAssetId: 'avatars/asset-1',
          url: 'https://res.cloudinary.com/demo/avatars/user-1.png',
          mimeType: 'image/png',
          sizeBytes: 123,
        },
        previousAsset: null,
      });

      const result = await target.confirmAvatarForTenant(tenantUser, 'avatars/asset-1');

      expect(mediaDbService.upsertAvatar).toHaveBeenCalledWith(
        { userId: 'user-1' },
        expect.objectContaining({ providerAssetId: 'avatars/asset-1' })
      );
      expect(result.avatarUrl).toBe('https://res.cloudinary.com/demo/avatars/user-1.png');
    });

    /** Regression: confirm verified against a shared `avatars` folder, so another owner's asset id (visible in avatar URLs) passed. */
    it("verifies the asset against the tenant user's own folder, not a shared one", async () => {
      storageProvider.verifyUpload.mockResolvedValue({ ok: false, reason: 'notFound' });

      await expect(
        target.confirmAvatarForTenant(tenantUser, 'avatars/platform-admins/admin-1/stolen')
      ).rejects.toThrow(MESSAGES.MEDIA.UPLOAD_NOT_VERIFIED);

      expect(storageProvider.verifyUpload).toHaveBeenCalledWith(
        'avatars/platform-admins/admin-1/stolen',
        'avatars/users/user-1'
      );
      expect(mediaDbService.upsertAvatar).not.toHaveBeenCalled();
    });

    /** Regression: every `verifyUpload` failure collapsed into one generic message, even an allowlist rejection that needed a different file. */
    it('surfaces MESSAGES.MEDIA.UNSUPPORTED_FORMAT specifically for an unsupported-format result', async () => {
      storageProvider.verifyUpload.mockResolvedValue({ ok: false, reason: 'unsupportedFormat' });

      await expect(target.confirmAvatarForTenant(tenantUser, 'avatars/asset-1')).rejects.toThrow(
        MESSAGES.MEDIA.UNSUPPORTED_FORMAT
      );
      expect(mediaDbService.upsertAvatar).not.toHaveBeenCalled();
    });

    it('falls back to the generic MESSAGES.MEDIA.UPLOAD_NOT_VERIFIED for a not-found result', async () => {
      storageProvider.verifyUpload.mockResolvedValue({ ok: false, reason: 'notFound' });

      await expect(target.confirmAvatarForTenant(tenantUser, 'avatars/asset-1')).rejects.toThrow(
        MESSAGES.MEDIA.UPLOAD_NOT_VERIFIED
      );
      expect(mediaDbService.upsertAvatar).not.toHaveBeenCalled();
    });
  });

  describe('confirmAvatarForAdmin', () => {
    it('rejects a tenant-user token, never writing a platform-admin-owned row with its id', async () => {
      await expect(target.confirmAvatarForAdmin(tenantUser, 'avatars/asset-1')).rejects.toThrow(
        ForbiddenException
      );
      expect(storageProvider.verifyUpload).not.toHaveBeenCalled();
      expect(mediaDbService.upsertAvatar).not.toHaveBeenCalled();
    });

    it('rejects with MESSAGES.ADMIN.ADMIN_ONLY specifically', async () => {
      await expect(target.confirmAvatarForAdmin(tenantUser, 'avatars/asset-1')).rejects.toThrow(
        MESSAGES.ADMIN.ADMIN_ONLY
      );
    });

    it('verifies and persists under the platformAdminId owner for a platform admin', async () => {
      storageProvider.verifyUpload.mockResolvedValue({
        ok: true,
        upload: {
          url: 'https://res.cloudinary.com/demo/avatars/admin-1.png',
          mimeType: 'image/png',
          sizeBytes: 456,
        },
      });
      mediaDbService.upsertAvatar.mockResolvedValue({
        row: {
          id: 'media-2',
          kind: 'avatar',
          provider: 'cloudinary',
          providerAssetId: 'avatars/asset-2',
          url: 'https://res.cloudinary.com/demo/avatars/admin-1.png',
          mimeType: 'image/png',
          sizeBytes: 456,
        },
        previousAsset: null,
      });

      const result = await target.confirmAvatarForAdmin(admin, 'avatars/asset-2');

      expect(mediaDbService.upsertAvatar).toHaveBeenCalledWith(
        { platformAdminId: 'admin-1' },
        expect.objectContaining({ providerAssetId: 'avatars/asset-2' })
      );
      expect(result.avatarUrl).toBe('https://res.cloudinary.com/demo/avatars/admin-1.png');
    });

    it("verifies the asset against the platform admin's own folder, not a shared one", async () => {
      storageProvider.verifyUpload.mockResolvedValue({ ok: false, reason: 'notFound' });

      await expect(
        target.confirmAvatarForAdmin(admin, 'avatars/users/user-1/stolen')
      ).rejects.toThrow(MESSAGES.MEDIA.UPLOAD_NOT_VERIFIED);

      expect(storageProvider.verifyUpload).toHaveBeenCalledWith(
        'avatars/users/user-1/stolen',
        'avatars/platform-admins/admin-1'
      );
      expect(mediaDbService.upsertAvatar).not.toHaveBeenCalled();
    });
  });

  describe('deleteAvatarIfPresent', () => {
    it('is a no-op when the owner never had an avatar', async () => {
      mediaDbService.findAvatarAsset.mockResolvedValue(null);

      await target.deleteAvatarIfPresent({ userId: 'user-1' });

      expect(storageProvider.delete).not.toHaveBeenCalled();
      expect(mediaDbService.deleteAvatar).not.toHaveBeenCalled();
    });

    it("deletes the owner's avatar from the storage provider before the DB row", async () => {
      mediaDbService.findAvatarAsset.mockResolvedValue({
        provider: 'cloudinary',
        providerAssetId: 'avatars/users/user-1/asset-1',
      });
      storageProvider.delete.mockResolvedValue(undefined);

      await target.deleteAvatarIfPresent({ userId: 'user-1' });

      expect(storageProvider.delete).toHaveBeenCalledWith('avatars/users/user-1/asset-1');
      expect(mediaDbService.deleteAvatar).toHaveBeenCalledWith({ userId: 'user-1' });
    });

    /** A Cloudinary failure must not block anonymization, nor delete the `media` row of a still-live asset (keeps retry possible). */
    it('swallows a storage-provider deletion failure and leaves the DB row untouched', async () => {
      mediaDbService.findAvatarAsset.mockResolvedValue({
        provider: 'cloudinary',
        providerAssetId: 'avatars/users/user-1/asset-1',
      });
      storageProvider.delete.mockRejectedValue(new Error('Cloudinary is down'));

      await expect(target.deleteAvatarIfPresent({ userId: 'user-1' })).resolves.toBeUndefined();
      expect(mediaDbService.deleteAvatar).not.toHaveBeenCalled();
    });

    /** `StorageAssetNotFoundError` means a prior run's storage delete succeeded but the DB delete didn't; it must still clean up the stale row or every retry fails. */
    it('still deletes the stale DB row when the asset is already gone from storage', async () => {
      mediaDbService.findAvatarAsset.mockResolvedValue({
        provider: 'cloudinary',
        providerAssetId: 'avatars/users/user-1/asset-1',
      });
      storageProvider.delete.mockRejectedValue(
        new StorageAssetNotFoundError('Cloudinary asset does not exist.')
      );

      await expect(target.deleteAvatarIfPresent({ userId: 'user-1' })).resolves.toBeUndefined();
      expect(mediaDbService.deleteAvatar).toHaveBeenCalledWith({ userId: 'user-1' });
    });
  });
});
