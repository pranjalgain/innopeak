import { Public } from '@auth/decorators/public.decorator';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { PlatformSettingsResponseDto } from '../dto/platform-settings-response.dto';
import { PlatformSettingsService } from '../services/platform-settings.service';
import { ApiGetPlatformSettings } from '../swagger/platform-settings.swagger';

/**
 * Its own controller so it carries no class-level `@Roles()`: `@Public()` skips only
 * `JwtAuthGuard`, so the owner-only guards on sibling controllers would still reject an
 * unauthenticated request.
 */
@Controller({
  path: `${RouteNames.SETTINGS}/${RouteNames.PLATFORM_CONFIG}`,
  version: '1',
})
@ApiTags('Settings')
@Public()
export class PlatformSettingsController {
  constructor(private readonly platformSettingsService: PlatformSettingsService) {}

  @Get()
  @ApiGetPlatformSettings()
  async get(): Promise<ApiResponse<PlatformSettingsResponseDto>> {
    const result = await this.platformSettingsService.get();
    return ResponseUtil.success(result, MESSAGES.SETTINGS.RETRIEVED);
  }
}
