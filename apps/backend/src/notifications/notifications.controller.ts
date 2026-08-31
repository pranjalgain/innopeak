import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { NotificationResponseDto } from './dto/notification-response.dto';
import { RegisterDeviceFidDto, SendNotificationDto } from './dto/send-notification.dto';
import { NotificationsService } from './notifications.service';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../auth/interfaces/auth-user.interface';

@Controller({ path: RouteNames.NOTIFICATIONS, version: '1' })
@ApiTags('Notifications')
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user notifications with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  async listNotifications(
    @CurrentUser() user: AuthUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number
  ): Promise<{
    data: NotificationResponseDto[];
    meta: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const result = await this.notificationsService.getNotifications(user.id, page, pageSize);

    return {
      data: result.data.map(record => NotificationResponseDto.fromRecord(record)),
      meta: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  async getUnreadCount(@CurrentUser() user: AuthUser): Promise<{ unreadCount: number }> {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { unreadCount: count };
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Send a notification to a user (admin only)' })
  @ApiQuery({
    name: 'userId',
    required: true,
    type: String,
    description: 'Target user UUID',
  })
  async sendNotification(
    @Query('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SendNotificationDto
  ): Promise<NotificationResponseDto> {
    const record = await this.notificationsService.send({
      userId,
      title: dto.title,
      body: dto.body,
      type: dto.type,
      channel: dto.channel,
      ...(dto.data !== undefined ? { data: dto.data } : {}),
    });

    return NotificationResponseDto.fromRecord(record);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', type: String, description: 'Notification UUID' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser
  ): Promise<NotificationResponseDto> {
    const record = await this.notificationsService.markAsRead(id, user.id);

    if (!record) {
      throw new NotFoundException('Notification not found');
    }

    return NotificationResponseDto.fromRecord(record);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read for current user' })
  async markAllAsRead(@CurrentUser() user: AuthUser): Promise<{ markedCount: number }> {
    const count = await this.notificationsService.markAllAsRead(user.id);
    return { markedCount: count };
  }

  @Post('devices')
  @ApiOperation({ summary: 'Register a device Firebase Installation ID for push notifications' })
  async registerDevice(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceFidDto
  ): Promise<{ message: string }> {
    await this.notificationsService.registerDevice(user.id, dto.fid, dto.platform);
    return { message: 'Device FID registered successfully' };
  }
}
