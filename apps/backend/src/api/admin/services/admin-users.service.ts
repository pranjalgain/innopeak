import { UserStatus } from '@auth/enums/user-status.enum';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { AdminUserResponseDto } from '../dto/admin-user-response.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly adminUsersDbService: AdminUsersDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService
  ) {}

  async list(actor: AuthUser): Promise<AdminUserResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const rows = await this.adminUsersDbService.findAll();
    return rows.map(row => AdminUserResponseDto.from(row));
  }

  /**
   * Takes the actor for two reasons. It restores the `requirePlatformAdmin` check every sibling
   * admin service already had — this was the only one relying solely on the controller's
   * `@Roles` guard, so it was the only one that would not fail safe if that guard were ever
   * loosened. And it gives the activity log someone to attribute the entry to.
   *
   * Recorded after the write, like the business suspend/reactivate path: a not-found toggle has
   * nothing to log. The entry names both the user and their business, since an email alone is
   * ambiguous on a feed that spans every tenant.
   */
  async toggleActive(actor: AuthUser, userId: string): Promise<AdminUserResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.adminUsersDbService.toggleActive(userId);
    if (!row) {
      throw new NotFoundException(MESSAGES.ADMIN.USER_NOT_FOUND);
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type:
        row.status === UserStatus.DISABLED
          ? PlatformActivityType.USER_DEACTIVATED
          : PlatformActivityType.USER_ACTIVATED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      tenantId: row.businessId,
      businessName: row.businessName,
      targetEmail: row.email,
    });

    return AdminUserResponseDto.from(row);
  }
}
