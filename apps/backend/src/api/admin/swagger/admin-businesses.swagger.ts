import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { UpdateBusinessStatusDto } from '../dto/update-business-status.dto';

const ADMIN_BUSINESS_EXAMPLE = {
  id: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
  name: 'The Coastal Table',
  status: 'active',
  connectionStatus: 'connected',
  ownerName: 'Maria Delgado',
  ownerEmail: 'maria@coastaltable.com',
  userCount: 4,
  createdAt: '2025-11-02T09:00:00.000Z',
};

export function ApiListAdminBusinesses(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List every tenant, as a Super Admin "business"',
      description:
        'Platform-admin only. `status` collapses the real 3-value tenant_status (' +
        'pending_activation/active/suspended) into active/suspended for display; `connectionStatus` ' +
        "derives from the tenant's most recent review_provider_connections row the same way " +
        "ConnectionsService already reasons about a tenant's own connection.",
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: [AdminBusinessResponseDto],
      examples: { default: { summary: 'Business list', value: [ADMIN_BUSINESS_EXAMPLE] } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiUpdateAdminBusinessStatus(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Suspend or reactivate a tenant',
      description:
        'Reactivating always lands the real tenant_status on `active`, never back on ' +
        '`pending_activation`.',
    }),
    ApiBody({
      type: UpdateBusinessStatusDto,
      examples: { default: { summary: 'Suspend a tenant', value: { status: 'suspended' } } },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminBusinessResponseDto,
      examples: {
        default: {
          summary: 'Tenant suspended',
          value: { ...ADMIN_BUSINESS_EXAMPLE, status: 'suspended' },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Validation failed' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such tenant' })
  );
}
