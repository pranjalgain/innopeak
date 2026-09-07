import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { TenantSettingsResponseDto } from '../dto/tenant-settings-response.dto';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';
import { TenantSettingsService } from '../services/tenant-settings.service';
import { ApiGetTenantSettings, ApiPutTenantSettings } from '../swagger/tenant-settings.swagger';

@Controller({
  path: RouteNames.SETTINGS,
  version: '1',
})
@ApiTags('Settings')
@Roles(UserRole.OWNER)
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @Get()
  @ApiGetTenantSettings()
  async get(@CurrentUser() user: AuthUser): Promise<ApiResponse<TenantSettingsResponseDto>> {
    const result = await this.tenantSettingsService.get(user);
    return ResponseUtil.success(result, MESSAGES.SETTINGS.RETRIEVED);
  }

  @Put()
  @ApiPutTenantSettings()
  async replace(
    @Body() dto: UpdateTenantSettingsDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<TenantSettingsResponseDto>> {
    const result = await this.tenantSettingsService.replace(user, dto);
    return ResponseUtil.success(result, MESSAGES.SETTINGS.UPDATED);
  }
}
