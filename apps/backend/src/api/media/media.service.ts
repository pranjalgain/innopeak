import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { PlatformAdminOnlyException, TenantOnlyException } from '@auth/exceptions/auth.exceptions';
import type { AuthUser } from '@auth/types/auth.type';
import { MediaDbService } from '@db/repositories/media/media.db-service';
import type { MediaOwner } from '@db/repositories/media/types/media.type';
import { Injectable, Logger } from '@nestjs/common';

import { AvatarUploadAuthorizationResponseDto } from './dto/avatar-upload-authorization-response.dto';
import { ConfirmAvatarResponseDto } from './dto/confirm-avatar-response.dto';
import {
  AvatarUploadNotVerifiedException,
  MediaFileTooLargeException,
  StorageNotConfiguredException,
  UnsupportedMediaFormatException,
} from './exceptions/media.exceptions';
import { StorageProvider } from './providers/storage.provider';
import { StorageAssetNotFoundError } from './types/storage-provider.type';
import { avatarFolderFor } from './utils/avatar-folder.util';

/** Direct-to-provider avatar upload: mint an authorization, then verify independently what landed (never trust the client's claim). */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly storageProvider: StorageProvider,
    private readonly mediaDbService: MediaDbService
  ) {}

  /** Folder derives from the authenticated owner, never the client (see `avatarFolderFor`). */
  private async getAvatarUploadAuthorization(
    owner: MediaOwner
  ): Promise<AvatarUploadAuthorizationResponseDto> {
    if (!this.storageProvider.isConfigured()) {
      throw new StorageNotConfiguredException();
    }

    const authorization = await this.storageProvider.createUploadAuthorization({
      folder: avatarFolderFor(owner),
    });

    return AvatarUploadAuthorizationResponseDto.from(authorization);
  }

  async getUserAvatarUrl(userId: string): Promise<string | null> {
    return this.mediaDbService.findAvatarUrl({ userId });
  }

  /**
   * GDPR anonymization's hook into this module; a no-op when the owner never had an avatar. Storage is deleted before the
   * `media` row so a swallowed Cloudinary failure leaves the row for a retry instead of a silent leak.
   * `StorageAssetNotFoundError` still proceeds to the DB delete: a previous run already removed the asset, and every
   * retry would otherwise fail forever.
   */
  async deleteAvatarIfPresent(owner: MediaOwner): Promise<void> {
    const existing = await this.mediaDbService.findAvatarAsset(owner);
    if (!existing) {
      return;
    }

    try {
      await this.storageProvider.delete(existing.providerAssetId);
    } catch (error) {
      if (!(error instanceof StorageAssetNotFoundError)) {
        this.logger.warn(
          `Could not delete avatar asset "${existing.providerAssetId}" during anonymization: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return;
      }
      this.logger.warn(
        `Avatar asset "${existing.providerAssetId}" was already gone from storage during ` +
          `anonymization — removing the stale media row left over from an earlier, interrupted run.`
      );
    }

    await this.mediaDbService.deleteAvatar(owner);
  }

  async getPlatformAdminAvatarUrl(platformAdminId: string): Promise<string | null> {
    return this.mediaDbService.findAvatarUrl({ platformAdminId });
  }

  async confirmUserAvatar(userId: string, providerAssetId: string): Promise<string> {
    return this.confirmAvatar({ userId }, providerAssetId);
  }

  async confirmPlatformAdminAvatar(
    platformAdminId: string,
    providerAssetId: string
  ): Promise<string> {
    return this.confirmAvatar({ platformAdminId }, providerAssetId);
  }

  /** Actor-checked entry points for the avatar controllers: HTTP callers' JWT `type` isn't guaranteed to match the owner (see `assertActorType`). */
  async getAvatarUploadAuthorizationForTenant(
    actor: AuthUser
  ): Promise<AvatarUploadAuthorizationResponseDto> {
    this.assertActorType(actor, JwtTokenType.TENANT_USER);
    return this.getAvatarUploadAuthorization({ userId: actor.id });
  }

  async getAvatarUploadAuthorizationForAdmin(
    actor: AuthUser
  ): Promise<AvatarUploadAuthorizationResponseDto> {
    this.assertActorType(actor, JwtTokenType.PLATFORM_ADMIN);
    return this.getAvatarUploadAuthorization({ platformAdminId: actor.id });
  }

  async confirmAvatarForTenant(
    actor: AuthUser,
    providerAssetId: string
  ): Promise<ConfirmAvatarResponseDto> {
    this.assertActorType(actor, JwtTokenType.TENANT_USER);
    return ConfirmAvatarResponseDto.from(await this.confirmUserAvatar(actor.id, providerAssetId));
  }

  async confirmAvatarForAdmin(
    actor: AuthUser,
    providerAssetId: string
  ): Promise<ConfirmAvatarResponseDto> {
    this.assertActorType(actor, JwtTokenType.PLATFORM_ADMIN);
    return ConfirmAvatarResponseDto.from(
      await this.confirmPlatformAdminAvatar(actor.id, providerAssetId)
    );
  }

  /**
   * `@CurrentUser()` only guarantees a valid JWT of some type, and the tenant route isn't `@Roles()`-gated (it also serves
   * `@Public()` routes). Without this a platform admin would write a `media` row under `userId`, surfacing as a raw FK 500, not a 403.
   */
  private assertActorType(actor: AuthUser, expected: JwtTokenType): void {
    if (actor.type === expected) {
      return;
    }
    if (expected === JwtTokenType.TENANT_USER) {
      throw new TenantOnlyException();
    }
    throw new PlatformAdminOnlyException();
  }

  private async confirmAvatar(owner: MediaOwner, providerAssetId: string): Promise<string> {
    // `providerAssetId` is attacker-supplied (visible in avatar URLs); checking this owner's folder stops one owner
    // confirming, and later deleting, another's asset.
    const verification = await this.storageProvider.verifyUpload(
      providerAssetId,
      avatarFolderFor(owner)
    );
    if (!verification.ok) {
      if (verification.reason === 'notFound') {
        throw new AvatarUploadNotVerifiedException();
      }
      if (verification.reason === 'unsupportedFormat') {
        throw new UnsupportedMediaFormatException();
      }
      throw new MediaFileTooLargeException();
    }
    const verified = verification.upload;

    const { row, previousAsset } = await this.mediaDbService.upsertAvatar(owner, {
      provider: this.storageProvider.type,
      providerAssetId,
      url: verified.url,
      mimeType: verified.mimeType,
      sizeBytes: verified.sizeBytes,
    });

    if (previousAsset) {
      // Best-effort after the DB commit: a failure leaves an orphaned asset, never a rolled-back avatar. Uses the active
      // provider, not `previousAsset.provider`; swapping providers would need a registry keyed by that value.
      this.storageProvider.delete(previousAsset.providerAssetId).catch((error: unknown) => {
        this.logger.warn(
          `Could not delete previous avatar asset "${previousAsset.providerAssetId}": ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
    }

    return row.url;
  }
}
