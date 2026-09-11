import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { TenantSettingsResponseDto } from '../dto/tenant-settings-response.dto';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';

export function ApiGetTenantSettings(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Get tenant settings',
      description:
        'Owner-only. Reads the tenant_settings singleton. 404 if the signup transaction never wrote the row.',
    }),
    ApiResponse({ status: HttpStatus.OK, type: TenantSettingsResponseDto }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'tenant_settings row missing' })
  );
}

export function ApiPutTenantSettings(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Replace tenant settings',
      description:
        'Owner-only full-resource replace. Not retroactive — already-classified reviews are unchanged. ' +
        'Omitting reviewDataRetentionMonths stores NULL, which opts this tenant out of the ' +
        'nightly reviewer-retention purge entirely — there is no platform-default fallback.',
    }),
    ApiBody({ type: UpdateTenantSettingsDto }),
    ApiResponse({ status: HttpStatus.OK, type: TenantSettingsResponseDto }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'tenant_settings row missing' })
  );
}
