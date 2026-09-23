import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { NotificationsDbService } from '@db/repositories/notifications/notifications.db-service';
import { Injectable } from '@nestjs/common';

import {
  NOTIFICATIONS_LIMIT_DEFAULT,
  NOTIFICATIONS_LIMIT_MAX,
} from './constants/notifications.constants';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationListResponseDto,
  NotificationReadResponseDto,
} from './dto/notification-response.dto';
import { NotificationNotFoundException } from './exceptions/notifications.exceptions';

import type { AuthUser } from '../auth/types/auth-user.type';

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsDbService: NotificationsDbService) {}

  /**
   * Scoped to `tenant_id` **and** `user_id` from the token — there is no parameter anywhere that
   * reads another user's feed, at any role. An owner has no privileged view of a member's
   * notifications; that would be a different resource with a different justification.
   */
  async list(
    user: AuthUser,
    query: ListNotificationsQueryDto
  ): Promise<NotificationListResponseDto> {
    const tenantUser = requireTenantUser(user);
    const offset = query.offset ?? 0;
    const limit = Math.min(query.limit ?? NOTIFICATIONS_LIMIT_DEFAULT, NOTIFICATIONS_LIMIT_MAX);

    const page = await this.notificationsDbService.listPage({
      tenantId: tenantUser.tenantId,
      userId: tenantUser.id,
      offset,
      limit,
    });

    return NotificationListResponseDto.from(page);
  }

  /**
   * Scoped the same way `list` is: the row has to belong to this tenant *and* this user, so a
   * notification id belonging to someone else is a 404 rather than a silent write. Idempotent —
   * marking an already-read notification succeeds and leaves its original timestamp alone.
   */
  async markRead(user: AuthUser, notificationId: string): Promise<NotificationReadResponseDto> {
    const tenantUser = requireTenantUser(user);

    const result = await this.notificationsDbService.markRead({
      tenantId: tenantUser.tenantId,
      userId: tenantUser.id,
      notificationId,
    });

    if (!result) {
      throw new NotificationNotFoundException();
    }

    return NotificationReadResponseDto.from(result);
  }

  /** Every unread row in the caller's own feed — never anyone else's, for the same reason. */
  async markAllRead(user: AuthUser): Promise<NotificationReadResponseDto> {
    const tenantUser = requireTenantUser(user);

    const result = await this.notificationsDbService.markAllRead(
      tenantUser.tenantId,
      tenantUser.id
    );

    return NotificationReadResponseDto.from(result);
  }
}
