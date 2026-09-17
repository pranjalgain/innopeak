import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import type { AuthUser } from '@auth/types/auth-user.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { UpdateBusinessStatusDto } from '../dto/update-business-status.dto';
import { AdminBusinessesService } from '../services/admin-businesses.service';
import {
  ApiListAdminBusinesses,
  ApiUpdateAdminBusinessStatus,
} from '../swagger/admin-businesses.swagger';

@Controller({ path: RouteNames.ADMIN_BUSINESSES, version: '1' })
@ApiTags('Admin — Businesses')
@Roles(JwtTokenType.PLATFORM_ADMIN)
export class AdminBusinessesController {
  constructor(private readonly adminBusinessesService: AdminBusinessesService) {}

  @Get()
  @ApiListAdminBusinesses()
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponseDto<AdminBusinessResponseDto[]>> {
    const result = await this.adminBusinessesService.list(user);
    return ResponseUtil.success(result, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.ADMIN_BUSINESS_STATUS)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiUpdateAdminBusinessStatus()
  async updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpdateBusinessStatusDto
  ): Promise<ApiResponseDto<AdminBusinessResponseDto>> {
    const result = await this.adminBusinessesService.setStatus(user, {
      tenantId,
      status: dto.status,
    });
    return ResponseUtil.success(result, MESSAGES.ADMIN.BUSINESS_STATUS_UPDATED, HttpStatus.OK);
  }
}
