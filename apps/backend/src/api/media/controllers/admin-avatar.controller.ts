import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AvatarUploadAuthorizationResponseDto } from '../dto/avatar-upload-authorization-response.dto';
import { ConfirmAvatarResponseDto } from '../dto/confirm-avatar-response.dto';
import { ConfirmAvatarDto } from '../dto/confirm-avatar.dto';
import { MediaService } from '../media.service';
import {
  ApiConfirmAdminAvatar,
  ApiGetAdminAvatarUploadAuthorization,
} from '../swagger/admin-avatar.swagger';

@Controller({ path: RouteNames.ADMIN_SETTINGS, version: '1' })
@ApiTags('Admin — Settings')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminAvatarController {
  constructor(private readonly mediaService: MediaService) {}

  @Post(RouteNames.ADMIN_SETTINGS_AVATAR_AUTHORIZE)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiGetAdminAvatarUploadAuthorization()
  async authorize(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<AvatarUploadAuthorizationResponseDto>> {
    const result = await this.mediaService.getAvatarUploadAuthorizationForAdmin(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.ADMIN_SETTINGS_AVATAR_CONFIRM)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiConfirmAdminAvatar()
  async confirmAvatar(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmAvatarDto
  ): Promise<ApiResponse<ConfirmAvatarResponseDto>> {
    const result = await this.mediaService.confirmAvatarForAdmin(user, dto.providerAssetId);
    return ResponseUtil.success(result, MESSAGES.ADMIN.AVATAR_UPDATED, HttpStatus.OK);
  }
}
