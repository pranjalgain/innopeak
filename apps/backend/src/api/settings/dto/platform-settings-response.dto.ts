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

  static from(row: PlatformSettingsRow): PlatformSettingsResponseDto {
    const dto = new PlatformSettingsResponseDto();
    dto.ssoLoginEnabled = row.ssoLoginEnabled;
    dto.passwordLoginEnabled = row.passwordLoginEnabled;
    dto.socialLoginEnabled = row.socialLoginEnabled;
    dto.inviteMembersEnabled = row.inviteMembersEnabled;
    return dto;
  }
}
