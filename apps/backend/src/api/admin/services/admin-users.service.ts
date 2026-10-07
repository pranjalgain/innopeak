import { UserStatus } from '@auth/enums/user-status.enum';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import { AdminUserResponseDto } from '../dto/admin-user-response.dto';
import type { ListAdminUsersQueryDto } from '../dto/list-admin-users-query.dto';
import {
  AdminUserNotFoundException,
  UserRemovalPendingException,
} from '../exceptions/admin.exceptions';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly adminUsersDbService: AdminUsersDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService
  ) {}

  async list(actor: AuthUser, query: ListAdminUsersQueryDto): Promise<AdminUserResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const rows = await this.adminUsersDbService.findAll(query.search);
    return rows.map(row => AdminUserResponseDto.from(row));
  }

  /**
   * Re-checks `requirePlatformAdmin` so it does not rely solely on the controller's `@Roles` guard.
   * Logged after the write; names both user and business since an email alone is ambiguous across tenants.
   */
  async toggleActive(actor: AuthUser, userId: string): Promise<AdminUserResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const result = await this.adminUsersDbService.toggleActive(userId);
    if (result.outcome === 'not_found') {
      throw new AdminUserNotFoundException();
    }
    if (result.outcome === 'removal_pending') {
      throw new UserRemovalPendingException();
    }
    const { row } = result;

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
