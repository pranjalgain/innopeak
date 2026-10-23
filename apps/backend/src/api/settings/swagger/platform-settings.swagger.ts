import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

import { PlatformSettingsResponseDto } from '../dto/platform-settings-response.dto';

export function ApiGetPlatformSettings(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiOperation({
      summary: 'Get platform-wide feature settings',
      description:
        'Public — no auth required. Which login methods the sign-in/sign-up screens offer, and ' +
        'whether a tenant Settings > Members tab can send invites. Read-only here; a Super Admin ' +
        'changes these from Admin Settings (PATCH /v1/admin/settings/platform-config).',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: PlatformSettingsResponseDto,
      examples: {
        default: {
          summary: 'Typical response',
          value: {
            microsoftLoginEnabled: true,
            passwordLoginEnabled: false,
            googleLoginEnabled: false,
            inviteMembersEnabled: false,
            notificationSettingsEnabled: false,
            paymentFeatureEnabled: false,
            erasureGracePeriodDays: 21,
            adminMicrosoftLoginAvailable: false,
            adminGoogleLoginAvailable: true,
          },
        },
      },
    })
  );
}
