import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { MediaService } from '@media/media.service';
import { Injectable } from '@nestjs/common';

/**
 * Deliberately not one transaction: the avatar deletion hits Cloudinary, which cannot join a
 * Postgres transaction, and `anonymizeUser` is idempotent, so a crash between the steps is
 * safe to retry.
 */
@Injectable()
export class AccountAnonymizationService {
  constructor(
    private readonly mediaService: MediaService,
    private readonly authDbService: AuthDbService
  ) {}

  /**
   * The only step that can fail for an outside reason (Cloudinary down, unconfigured). A caller erasing a whole business runs it for every
   * user *before* anonymizing any, so a failure leaves the business exactly as it was: its members' addresses are still there for the
   * "erased" notice, which is read before anonymizing and could not be rebuilt afterwards.
   */
  async deleteAvatar(userId: string): Promise<void> {
    await this.mediaService.deleteAvatarIfPresent({ userId });
  }

  /** Rethrows a failed avatar delete without anonymizing: an account marked erased is never revisited, so its photo would stay public. */
  async anonymizeUser(userId: string): Promise<void> {
    await this.deleteAvatar(userId);
    await this.authDbService.anonymizeUser(userId);
  }
}
