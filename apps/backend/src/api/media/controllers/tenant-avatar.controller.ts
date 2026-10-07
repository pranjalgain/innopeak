import { CurrentUser } from '@auth/decorators/current-user.decorator';
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
  ApiConfirmAvatar,
  ApiGetAvatarUploadAuthorization,
} from '../swagger/tenant-avatar.swagger';

@Controller({ path: RouteNames.AUTH, version: '1' })
@ApiTags('Auth')
export class TenantAvatarController {
  constructor(private readonly mediaService: MediaService) {}

  @Post(RouteNames.AVATAR_AUTHORIZE)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiGetAvatarUploadAuthorization()
  async authorize(
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<AvatarUploadAuthorizationResponseDto>> {
    const result = await this.mediaService.getAvatarUploadAuthorizationForTenant(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.AVATAR_CONFIRM)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiConfirmAvatar()
  async confirmAvatar(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmAvatarDto
  ): Promise<ApiResponse<ConfirmAvatarResponseDto>> {
    const result = await this.mediaService.confirmAvatarForTenant(user, dto.providerAssetId);
    return ResponseUtil.success(result, MESSAGES.AUTH.AVATAR_UPDATED, HttpStatus.OK);
  }
}
