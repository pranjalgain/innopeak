import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { MediaService } from '@media/media.service';
import { Injectable } from '@nestjs/common';

/**
 * The one method both erasure flows' purge paths call — see `apps/backend/docs/PLAN.md §6.2` for
 * why anonymize-in-place (never a hard delete) is the mechanism. Avatar deletion happens first,
 * through `MediaService` rather than `MediaDbService` directly, per `MediaModule`'s own "nothing
 * outside `MediaService` talks to a storage provider" convention — the same cross-domain-dependency
 * shape `TenantMembersService` already uses for `BillingEntitlementsService`.
 *
 * Deliberately NOT a transaction spanning both calls: `deleteAvatarIfPresent` reaches out to
 * Cloudinary, which cannot participate in a Postgres transaction anyway, and `anonymizeUser` is
 * independently idempotent — a crash between the two steps just means the next run's avatar
 * deletion is a no-op (already gone) followed by the same `anonymizeUser` call succeeding.
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
