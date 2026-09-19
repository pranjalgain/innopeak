import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth-user.type';
import { setAdminSessionCookies } from '@auth/utils/admin-session-cookies.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { UpdateLocaleDto } from '../../auth/dto/update-locale.dto';
import { PlatformSettingsResponseDto } from '../../settings/dto/platform-settings-response.dto';
import { AdminInviteResponseDto } from '../dto/admin-invite-response.dto';
import { AdminProfileResponseDto } from '../dto/admin-profile-response.dto';
import { ChangeAdminPasswordDto } from '../dto/change-admin-password.dto';
import { SendAdminInviteDto } from '../dto/send-admin-invite.dto';
import { SetAdminStatusDto } from '../dto/set-admin-status.dto';
import { UpdateAdminLocaleResponseDto } from '../dto/update-admin-locale-response.dto';
import { UpdatePlatformSettingsDto } from '../dto/update-platform-settings.dto';
import { AdminSettingsService } from '../services/admin-settings.service';
import {
  ApiChangeAdminPassword,
  ApiGetAdminProfile,
  ApiListAdminInvites,
  ApiRevokeAdminInvite,
  ApiSendAdminInvite,
  ApiSetAdminStatus,
  ApiUpdateAdminLocale,
  ApiUpdatePlatformSettings,
} from '../swagger/admin-settings.swagger';

@Controller({ path: RouteNames.ADMIN_SETTINGS, version: '1' })
@ApiTags('Admin — Settings')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  @Get(RouteNames.ADMIN_SETTINGS_PROFILE)
  @ApiGetAdminProfile()
  async getProfile(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponseDto<AdminProfileResponseDto>> {
    const result = await this.adminSettingsService.getProfile(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Patch(RouteNames.ADMIN_SETTINGS_LOCALE)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiUpdateAdminLocale()
  async updateLocale(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateLocaleDto,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseDto<UpdateAdminLocaleResponseDto>> {
    const result = await this.adminSettingsService.updateLocale(user, dto);
    setAdminSessionCookies(res, result.accessToken);
    return ResponseUtil.success(result, MESSAGES.AUTH.LOCALE_UPDATED, HttpStatus.OK);
  }

  @Post(RouteNames.ADMIN_SETTINGS_CHANGE_PASSWORD)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiChangeAdminPassword()
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeAdminPasswordDto
  ): Promise<ApiResponseDto<{ message: string }>> {
    await this.adminSettingsService.changePassword(user, dto);
    return ResponseUtil.success(
      { message: MESSAGES.ADMIN.PASSWORD_CHANGED },
      MESSAGES.ADMIN.PASSWORD_CHANGED,
      HttpStatus.OK
    );
  }

  @Get(RouteNames.ADMIN_SETTINGS_INVITES)
  @ApiListAdminInvites()
  async listInvites(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponseDto<AdminInviteResponseDto[]>> {
    const result = await this.adminSettingsService.listInvites(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.ADMIN_SETTINGS_INVITES)
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiSendAdminInvite()
  async sendInvite(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendAdminInviteDto
  ): Promise<ApiResponseDto<AdminInviteResponseDto>> {
    const result = await this.adminSettingsService.sendInvite(user, dto);
    return ResponseUtil.success(result, MESSAGES.ADMIN.INVITE_SENT, HttpStatus.CREATED);
  }

  @Delete(RouteNames.ADMIN_SETTINGS_INVITE_BY_ID)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiRevokeAdminInvite()
  async revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string
  ): Promise<ApiResponseDto<{ message: string }>> {
    await this.adminSettingsService.revokeInvite(user, inviteId);
    return ResponseUtil.success(
      { message: MESSAGES.ADMIN.INVITE_REVOKED },
      MESSAGES.ADMIN.INVITE_REVOKED,
      HttpStatus.OK
    );
  }

  @Patch(RouteNames.ADMIN_SETTINGS_ADMIN_STATUS)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiSetAdminStatus()
  async setAdminStatus(
    @CurrentUser() user: AuthUser,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() dto: SetAdminStatusDto
  ): Promise<ApiResponseDto<AdminInviteResponseDto>> {
    const { admin: result, message } = await this.adminSettingsService.setAdminStatus(user, {
      targetAdminId: adminId,
      enabled: dto.enabled,
    });
    return ResponseUtil.success(result, message, HttpStatus.OK);
  }

  @Patch(RouteNames.ADMIN_SETTINGS_PLATFORM_CONFIG)
  @ApiUpdatePlatformSettings()
  async updatePlatformSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePlatformSettingsDto
  ): Promise<ApiResponseDto<PlatformSettingsResponseDto>> {
    const result = await this.adminSettingsService.updatePlatformSettings(user, dto);
    return ResponseUtil.success(result, MESSAGES.ADMIN.PLATFORM_SETTINGS_UPDATED, HttpStatus.OK);
  }
}
