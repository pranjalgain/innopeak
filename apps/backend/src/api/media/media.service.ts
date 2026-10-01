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
  UnsupportedMediaFormatException,
} from './exceptions/media.exceptions';
import { StorageProvider } from './providers/storage.provider';
import { StorageAssetNotFoundError } from './types/storage-provider.type';
import { avatarFolderFor } from './utils/avatar-folder.util';

/**
 * Orchestrates the direct-to-provider avatar upload: mint an authorization the client uploads
 * with, then independently verify and persist what actually landed — see `StorageProvider`'s own
 * doc comments for why verification never trusts the client's own claim. `TenantAvatarController`/
 * `AdminAvatarController` (this module's own `controllers/`) are the two routes that call in here;
 * see the `*ForTenant`/`*ForAdmin` methods below for why the actor check lives here rather than on
 * those controllers.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly storageProvider: StorageProvider,
    private readonly mediaDbService: MediaDbService
  ) {}

  /** Signs an upload scoped to this owner's own folder — see `avatarFolderFor` for why the folder
   *  is derived from the authenticated owner rather than accepted from the client. */
  private async getAvatarUploadAuthorization(
    owner: MediaOwner
  ): Promise<AvatarUploadAuthorizationResponseDto> {
    const authorization = await this.storageProvider.createUploadAuthorization({
      folder: avatarFolderFor(owner),
    });

    return AvatarUploadAuthorizationResponseDto.from(authorization);
  }

  async getUserAvatarUrl(userId: string): Promise<string | null> {
    return this.mediaDbService.findAvatarUrl({ userId });
  }

  /**
   * GDPR anonymization's one hook into this module — `AccountAnonymizationService` depends on
   * `MediaService`, never `MediaDbService` directly, per this module's own "nothing outside
   * `MediaService` talks to a storage provider" convention. A no-op (not an error) when the owner
   * never had an avatar.
   *
   * Deletes from storage *before* the `media` row — the previous order deleted the row first, so a
   * Cloudinary failure (swallowed, since it must never block anonymization) left the row gone but
   * the asset still live in storage with nothing left in the DB to ever retry or reconcile it
   * against. Deleting storage first means a failure here simply leaves the row in place: the asset
   * is still reachable, and a future retry of this same method (or of the whole anonymization) sees
   * it again and tries again, instead of the leak being silent and permanent.
   *
   * That retry story only works as long as a storage failure genuinely means "still there, try
   * again" — which is why a `StorageAssetNotFoundError` is handled separately from every other
   * failure. If the process crashed (or the DB delete below threw) on a *previous* run, right after
   * that run's storage delete had already succeeded, this run's `storageProvider.delete` call finds
   * nothing left to delete and throws exactly that error — treating it the same as a real failure
   * would leave the row stuck forever, since every future retry fails identically. The asset being
   * gone IS the state a delete is trying to reach, so this case still proceeds to the DB delete.
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

  /**
   * Actor-checked entry points for `TenantAvatarController`/`AdminAvatarController` — the two
   * avatar upload/confirm route pairs both live in this module (not on `AuthController`/
   * `AdminSettingsController`) precisely so a future third avatar owner, or a second media `kind`
   * (a business logo, say), only ever means adding another pair of these here, never touching
   * another module's controller. The plain `confirmUserAvatar`/`getUserAvatarUrl`-style methods
   * above stay owner-agnostic and reusable; the actor check is what's specific to being reached
   * over HTTP by a caller whose JWT `type` claim isn't already guaranteed to match the owner it's
   * asking to act as (see `assertActorType`'s own comment).
   */
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
   * `@CurrentUser()` only guarantees a *valid* JWT of *some* type — nothing stops a platform-admin
   * token from reaching a route mounted at `RouteNames.AUTH` (that controller isn't `@Roles()`-
   * gated, since it also serves `@Public()` routes), or vice versa. Without this, a platform admin
   * calling the tenant confirm route would write a `media` row keyed by their own id under
   * `userId` — wrong owner column, and only caught (as a raw FK-violation 500, not a clean 403) if
   * that id doesn't also happen to exist in `users`. Every one of the four methods above needs this
   * exact check, which is why it's a shared private helper rather than four copies of the same
   * `if`.
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
    // Verified against *this owner's* folder, not a shared one: `providerAssetId` is attacker-
    // supplied (it's readable in any rendered avatar URL), so this is the check that stops one
    // owner confirming another's asset and, on their next upload, deleting it.
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
      // Best-effort, after the DB write above has already committed the new avatar — a failure
      // here leaves an orphaned asset in storage, never a broken/rolled-back avatar. Deliberately
      // deletes via the *currently active* provider rather than `previousAsset.provider`: if the
      // active provider is ever swapped while old assets from a previous one still exist, cleaning
      // those up needs a provider registry keyed by that stored value, not the single injected
      // instance this constructor has — out of scope while only one provider is ever configured.
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
