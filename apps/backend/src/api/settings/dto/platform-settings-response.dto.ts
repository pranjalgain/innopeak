import type { PlatformSettingsRow } from '@db/repositories/platform-settings/platform-settings.repository';
import { ApiProperty } from '@nestjs/swagger';

export class PlatformSettingsResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the sign-in/sign-up screens offer the Microsoft SSO button.',
  })
  ssoLoginEnabled!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the sign-in/sign-up screens offer email/password.',
  })
  passwordLoginEnabled!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the sign-in/sign-up screens offer Google social sign-in.',
  })
  socialLoginEnabled!: boolean;

  @ApiProperty({
    example: false,
    description: "Whether a tenant owner's Settings > Members tab can send invites.",
  })
  inviteMembersEnabled!: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether billing exists in this deploy at all — new sign-ups get a Paid plan option, ' +
      'admins see the Billing dashboard, and Checkout/the Customer Portal are reachable. A pure ' +
      "reflection of the deploy-level PAYMENT_FEATURE_ENABLED env var (env.config.ts's own doc " +
      'comment explains why there is deliberately no second, runtime-toggleable copy of this) — ' +
      'not stored on `platform_settings` and not writable through this API.',
  })
  paymentFeatureEnabled!: boolean;

  static from(
    row: PlatformSettingsRow,
    paymentFeatureEnabled: boolean
  ): PlatformSettingsResponseDto {
    const dto = new PlatformSettingsResponseDto();
    dto.ssoLoginEnabled = row.ssoLoginEnabled;
    dto.passwordLoginEnabled = row.passwordLoginEnabled;
    dto.socialLoginEnabled = row.socialLoginEnabled;
    dto.inviteMembersEnabled = row.inviteMembersEnabled;
    dto.paymentFeatureEnabled = paymentFeatureEnabled;
    return dto;
  }
}
