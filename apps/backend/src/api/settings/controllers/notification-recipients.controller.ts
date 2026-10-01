import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../../auth/types/auth.type';
import {
  NotificationRecipientDto,
  NotificationRecipientListResponseDto,
} from '../dto/notification-recipient-response.dto';
import { UpdateNotificationRecipientDto } from '../dto/update-notification-recipient.dto';
import { NotificationRecipientsService } from '../services/notification-recipients.service';
import {
  ApiListNotificationRecipients,
  ApiUpdateNotificationRecipient,
} from '../swagger/notification-recipients.swagger';

@Controller({
  path: `${RouteNames.SETTINGS}/${RouteNames.NOTIFICATION_RECIPIENTS}`,
  version: '1',
})
@ApiTags('Settings')
@Roles(UserRole.OWNER)
export class NotificationRecipientsController {
  constructor(private readonly notificationRecipientsService: NotificationRecipientsService) {}

  @Get()
  @ApiListNotificationRecipients()
  async list(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<NotificationRecipientListResponseDto>> {
    const result = await this.notificationRecipientsService.list(user);
    return ResponseUtil.success(result, MESSAGES.SETTINGS.NOTIFICATION_RECIPIENTS_LISTED);
  }

  @Patch(RouteNames.NOTIFICATION_RECIPIENT_BY_ID)
  @ApiUpdateNotificationRecipient()
  async update(
    @Param('recipientId', ParseUUIDPipe) recipientId: string,
    @Body() dto: UpdateNotificationRecipientDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<NotificationRecipientDto>> {
    const result = await this.notificationRecipientsService.update(user, recipientId, dto);
    return ResponseUtil.success(result, MESSAGES.SETTINGS.NOTIFICATION_RECIPIENT_UPDATED);
  }
}
