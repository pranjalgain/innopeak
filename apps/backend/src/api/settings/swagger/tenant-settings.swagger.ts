import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { TenantSettingsResponseDto } from '../dto/tenant-settings-response.dto';
import { UpdateTenantSettingsDto } from '../dto/update-tenant-settings.dto';

const TENANT_SETTINGS_EXAMPLE = {
  id: '0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33',
  escalationRatingThreshold: 3,
  autoPostEnabled: false,
  reviewDataRetentionMonths: 24,
  aiReplyCount: 1,
  updatedAt: '2026-08-28T09:12:44.000Z',
};

export function ApiGetTenantSettings(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Get tenant settings',
      description:
        'Owner-only. Reads the tenant_settings singleton. 404 if the signup transaction never wrote the row.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: TenantSettingsResponseDto,
      examples: { default: { summary: 'Typical response', value: TENANT_SETTINGS_EXAMPLE } },
    }),
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
    ApiBody({
      type: UpdateTenantSettingsDto,
      examples: {
        default: {
          value: {
            escalationRatingThreshold: 3,
            autoPostEnabled: false,
            reviewDataRetentionMonths: 24,
            aiReplyCount: 1,
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: TenantSettingsResponseDto,
      examples: { default: { summary: 'Typical response', value: TENANT_SETTINGS_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'tenant_settings row missing' })
  );
}
