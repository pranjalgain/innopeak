import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AdminUserResponseDto } from '../dto/admin-user-response.dto';

export function ApiListAdminUsers(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List every user across every tenant',
      description:
        'Platform-admin only. No pagination/filter params yet — the console does its own ' +
        'client-side paging over the full list.',
    }),
    ApiResponse({ status: HttpStatus.OK, type: [AdminUserResponseDto] }),
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
    ApiResponse({ status: HttpStatus.OK, type: AdminUserResponseDto }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'No such user' })
  );
}
