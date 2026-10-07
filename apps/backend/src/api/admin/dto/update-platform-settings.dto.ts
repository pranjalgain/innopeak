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
  ssoLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  passwordLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  socialLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(parseBooleanInput)
  @IsBoolean()
  inviteMembersEnabled?: boolean;
}
