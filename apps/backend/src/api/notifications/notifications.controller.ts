import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationListResponseDto,
  NotificationReadResponseDto,
} from './dto/notification-response.dto';
import { NotificationStreamService } from './realtime/notification-stream.service';
import { NotificationsService } from './services/notifications.service';
import {
  ApiListNotifications,
  ApiMarkAllNotificationsRead,
  ApiMarkNotificationRead,
  ApiNotificationStream,
} from './swagger/notifications.swagger';

import type { AuthUser } from '../auth/types/auth.type';

/** No `@Roles()` gate: every tenant user reads their own feed; scoping to `user_id` is done in the service. */
@Controller({
  path: RouteNames.NOTIFICATIONS,
  version: '1',
})
@ApiTags('Notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationStreamService: NotificationStreamService
  ) {}

  @Get()
  @ApiListNotifications()
  async list(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<NotificationListResponseDto>> {
    const result = await this.notificationsService.list(user, query);
    return ResponseUtil.success(result, MESSAGES.NOTIFICATIONS.LISTED);
  }

  /**
   * One long response the browser opens and the server keeps writing to; see `NotificationStreamService`. Registered before the
   * `:notificationId/read` route so `stream` is never read as an id.
   */
  @Sse(RouteNames.NOTIFICATIONS_STREAM)
  @ApiNotificationStream()
  stream(@CurrentUser() user: AuthUser, @Req() req: Request): Observable<MessageEvent> {
    return this.notificationStreamService.connect(user, req);
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
