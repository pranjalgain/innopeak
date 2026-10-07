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

import type { AuthUser } from '../auth/types/auth.type';

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsDbService: NotificationsDbService) {}

  /** Scoped to `tenant_id` and `user_id` from the token; no role, owner included, can read another user's feed. */
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

  /** A notification belonging to someone else is a 404, not a silent write. Idempotent: an already-read row keeps its original timestamp. */
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

  /** Only the caller's own feed. */
  async markAllRead(user: AuthUser): Promise<NotificationReadResponseDto> {
    const tenantUser = requireTenantUser(user);

    const result = await this.notificationsDbService.markAllRead(
      tenantUser.tenantId,
      tenantUser.id
    );

    return NotificationReadResponseDto.from(result);
  }
}
