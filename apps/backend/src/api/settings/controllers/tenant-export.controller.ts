import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { UserRole } from '@auth/enums/user-role.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { RouteNames } from '@common/route-names';
import { Controller, Get, Header, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { TenantExportService } from '../services/tenant-export.service';
import { ApiExportTenantData } from '../swagger/tenant-export.swagger';

/**
 * The body is the file itself, not an `ApiResponse` envelope (`TransformInterceptor` skips this
 * path). Throttled hard: each call reads the whole review history.
 */
@Controller({ path: `${RouteNames.SETTINGS}/${RouteNames.SETTINGS_EXPORT}`, version: '1' })
@ApiTags('Settings')
@Roles(UserRole.OWNER)
export class TenantExportController {
  constructor(private readonly tenantExportService: TenantExportService) {}

  @Get()
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @Header('Content-Type', 'application/json; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiExportTenantData()
  async exportData(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    const { stream, filename } = await this.tenantExportService.exportData(user);
    const file = new StreamableFile(stream, {
      disposition: `attachment; filename="${filename}"`,
    });
    // Headers are already sent when a later batch fails, and Nest's default would end the response
    // cleanly as a 200 with truncated JSON. Destroying the socket makes the browser report a failed
    // download.
    file.setErrorHandler((error, res) => {
      (res as unknown as { destroy: (error?: Error) => void }).destroy(error);
    });
    return file;
  }
}
