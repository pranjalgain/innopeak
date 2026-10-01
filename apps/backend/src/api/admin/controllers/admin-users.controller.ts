import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { AuthUser } from '../../auth/types/auth.type';
import { AdminUserResponseDto } from '../dto/admin-user-response.dto';
import { ListAdminUsersQueryDto } from '../dto/list-admin-users-query.dto';
import { AdminUsersService } from '../services/admin-users.service';
import { ApiListAdminUsers, ApiToggleAdminUserActive } from '../swagger/admin-users.swagger';

@Controller({ path: RouteNames.ADMIN_USERS, version: '1' })
@ApiTags('Admin — Users')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiListAdminUsers()
  async list(
    @CurrentUser() actor: AuthUser,
    @Query() query: ListAdminUsersQueryDto
  ): Promise<ApiResponseDto<AdminUserResponseDto[]>> {
    const result = await this.adminUsersService.list(actor, query);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.ADMIN_USER_TOGGLE_ACTIVE)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiToggleAdminUserActive()
  async toggleActive(
    @CurrentUser() actor: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string
  ): Promise<ApiResponseDto<AdminUserResponseDto>> {
    const result = await this.adminUsersService.toggleActive(actor, userId);
    return ResponseUtil.success(result, MESSAGES.ADMIN.USER_STATUS_UPDATED, HttpStatus.OK);
  }
}
