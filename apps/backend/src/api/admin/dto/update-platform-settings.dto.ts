import { parseBooleanInput } from '@common/helpers/boolean.utils';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, ValidateIf } from 'class-validator';

/**
 * `@Transform(parseBooleanInput)` on every field: implicit conversion turns `"false"` into `true`
 * before `@IsBoolean()` runs, silently enabling the setting.
 *
 * `@ValidateIf(value !== undefined)` rather than `@IsOptional()`, which lets `null` through to a
 * NOT NULL violation (500); here `null` is a 400.
 */
export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ example: true })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  microsoftLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  passwordLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  googleLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  inviteMembersEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'Not implemented yet: `true` is refused with 422 NOTIFICATION_CHANNELS_NOT_IMPLEMENTED until email/Teams delivery exists.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  notificationSettingsEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'Acknowledges that switching Microsoft or Google off locks out active tenant users who can only sign in with it. Without it ' +
      'that change is refused with 400 SSO_LOGIN_DISALLOWED_SSO_ONLY_USERS. Never stored; it applies to this request only.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  confirmLockout?: boolean;
}
