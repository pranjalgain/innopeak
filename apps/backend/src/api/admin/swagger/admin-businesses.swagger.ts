import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';

import {
  AdminBusinessListResponseDto,
  AdminBusinessResponseDto,
} from '../dto/admin-business-response.dto';
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
  erasureRequestedAt: null,
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
        "ConnectionsService already reasons about a tenant's own connection. `search` is applied " +
        'server-side (tenant name or owner name substring, case-insensitive), and the result is paged: ' +
        '`page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting ' +
        'the same filter.',
    }),
    ApiQuery({ name: 'search', required: false, example: 'coastal' }),
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, example: 10 }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminBusinessListResponseDto,
      examples: {
        default: {
          summary: 'Business list',
          value: {
            businesses: [ADMIN_BUSINESS_EXAMPLE],
            meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          },
        },
      },
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

export function ApiRequestBusinessErasure(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Request erasure of a whole tenant',
      description:
        'Platform-admin only (support/legal request) — never tenant-owner self-service. ' +
        'Suspends the tenant immediately, so every user in it loses access now; the actual ' +
        'anonymization of every user runs later, in a nightly job, once ' +
        '`ERASURE_GRACE_PERIOD_DAYS` has elapsed. Reviews, replies, locations, connections, and ' +
        'billing records are never touched — no PII lives in them once every user is anonymized. ' +
        'Cancellable any time before the grace period elapses.',
    }),
    ApiParam({ name: 'tenantId', description: 'The tenant to erase' }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminBusinessResponseDto,
      examples: {
        default: {
          summary: 'Erasure requested',
          value: {
            ...ADMIN_BUSINESS_EXAMPLE,
            status: 'suspended',
            erasureRequestedAt: '2026-03-05T09:12:00.000Z',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'No such tenant, or it has already been erased',
    })
  );
}

export function ApiCancelBusinessErasure(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Cancel a pending tenant erasure',
      description:
        'Restores the tenant to active and clears the pending marker — a clean, full undo, since ' +
        'nothing is anonymized until the grace period actually elapses.',
    }),
    ApiParam({ name: 'tenantId', description: 'The tenant to restore' }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminBusinessResponseDto,
      examples: { default: { summary: 'Erasure cancelled', value: ADMIN_BUSINESS_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'No such tenant, or it has no erasure pending',
    })
  );
}
