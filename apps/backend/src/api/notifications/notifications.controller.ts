import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationListResponseDto,
  NotificationReadResponseDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';
import {
  ApiListNotifications,
  ApiMarkAllNotificationsRead,
  ApiMarkNotificationRead,
} from './swagger/notifications.swagger';

import type { AuthUser } from '../auth/types/auth.type';

/**
 * No `@Roles()` gate — every authenticated tenant user reads their own feed, owner or member
 * alike. `NotificationsService.list` is what actually scopes a query to the caller's own
 * `user_id`, the same "checked in the service, not left to the guard" shape as
 * `TenantAvatarController`.
 */
@Controller({
  path: RouteNames.NOTIFICATIONS,
  version: '1',
})
@ApiTags('Notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiListNotifications()
  async list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<NotificationListResponseDto>> {
    const result = await this.notificationsService.list(user, query);
    return ResponseUtil.success(result, MESSAGES.NOTIFICATIONS.LISTED);
  }

  @Patch(RouteNames.NOTIFICATIONS_READ_ALL)
  @ApiMarkAllNotificationsRead()
  async markAllRead(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<NotificationReadResponseDto>> {
    const result = await this.notificationsService.markAllRead(user);
    return ResponseUtil.success(result, MESSAGES.NOTIFICATIONS.MARKED_ALL_READ);
  }

  @Patch(RouteNames.NOTIFICATION_BY_ID_READ)
  @ApiMarkNotificationRead()
  async markRead(
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<NotificationReadResponseDto>> {
    const result = await this.notificationsService.markRead(user, notificationId);
    return ResponseUtil.success(result, MESSAGES.NOTIFICATIONS.MARKED_READ);
  }
}
