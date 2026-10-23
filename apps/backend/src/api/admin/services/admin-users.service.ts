import { UserStatus } from '@auth/enums/user-status.enum';
import { TokenService } from '@auth/services/token.service';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import { ADMIN_LIST_PAGE_SIZE_DEFAULT } from '../constants/admin-overview.constants';
import { AdminUserListResponseDto, AdminUserResponseDto } from '../dto/admin-user-response.dto';
import type { ListAdminUsersQueryDto } from '../dto/list-admin-users-query.dto';
import {
  AdminUserNotFoundException,
  UserInvitePendingException,
  UserRemovalPendingException,
} from '../exceptions/admin.exceptions';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly adminUsersDbService: AdminUsersDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly tokenService: TokenService
  ) {}

  async list(actor: AuthUser, query: ListAdminUsersQueryDto): Promise<AdminUserListResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? ADMIN_LIST_PAGE_SIZE_DEFAULT;

    const { rows, total } = await this.adminUsersDbService.findPage({
      search: query.search,
      page,
      pageSize,
    });

    return {
      users: rows.map(row => AdminUserResponseDto.from(row)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  /**
   * Re-checks `requirePlatformAdmin` so it does not rely solely on the controller's `@Roles` guard.
   * Logged after the write; names both user and business since an email alone is ambiguous across tenants.
   */
  async toggleActive(
    actor: AuthUser,
    userId: string,
    target?: boolean
  ): Promise<AdminUserResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const result = await this.adminUsersDbService.toggleActive(userId, target);
    if (result.outcome === 'not_found') {
      throw new AdminUserNotFoundException();
    }
    if (result.outcome === 'removal_pending') {
      throw new UserRemovalPendingException();
    }
    if (result.outcome === 'invited') {
      throw new UserInvitePendingException();
    }
    const { row } = result;
    if (result.outcome === 'unchanged') {
      // Already in the state the admin asked for (a stale list, a double click): nothing changed, so nothing is revoked or logged.
      return AdminUserResponseDto.from(row);
    }

    // A deactivated user loses access now, not when their access token happens to lapse, and their refresh tokens end too: re-enabling
    // must not quietly revive a session from before it.
    if (row.status === UserStatus.DISABLED) {
      await this.tokenService.revokeAll(userId);
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
