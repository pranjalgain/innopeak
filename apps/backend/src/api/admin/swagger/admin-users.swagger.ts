import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { AdminUserListResponseDto, AdminUserResponseDto } from '../dto/admin-user-response.dto';

const ADMIN_USER_EXAMPLE = {
  id: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
  businessId: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
  businessName: 'The Coffee House',
  name: 'Jane Doe',
  email: 'jane@thecoffeehouse.com',
  role: 'owner',
  isActive: true,
  lastLoginAt: '2026-03-01T09:12:00.000Z',
};

export function ApiListAdminUsers(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List every user across every tenant',
      description:
        'Platform-admin only. `search` is applied server-side (user name or business name ' +
        'substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` ' +
        '(default 10, max 100), newest first, with `meta.total` counting the same filter.',
    }),
    ApiQuery({ name: 'search', required: false, example: 'jane' }),
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, example: 10 }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminUserListResponseDto,
      examples: {
        default: {
          summary: 'Admin user list',
          value: {
            users: [ADMIN_USER_EXAMPLE],
            meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiToggleAdminUserActive(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Toggle a user's active status",
      description:
        'A single toggle, not separate activate/deactivate calls: any status other than ' +
        "'disabled' flips to 'disabled'. Re-enabling restores the status the user must have had " +
        "before — 'active' if their email was ever verified, otherwise 'pending_verification', so " +
        'disabling an unverified signup never doubles as verifying them.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminUserResponseDto,
      examples: {
        default: { summary: 'User disabled', value: { ...ADMIN_USER_EXAMPLE, isActive: false } },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such user' })
  );
}
