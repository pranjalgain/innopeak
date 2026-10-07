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

  async anonymizeUser(userId: string): Promise<void> {
    await this.mediaService.deleteAvatarIfPresent({ userId });
    await this.authDbService.anonymizeUser(userId);
  }
}
