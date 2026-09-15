import { parseBooleanInput } from '@common/helpers/boolean.utils';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Partial by design — a Super Admin toggles one switch at a time, not the whole resource. Any
 * field omitted is left exactly as it was.
 *
 * Every field needs `@Transform(parseBooleanInput)`, the same as `UpdateTenantSettingsDto`: the
 * global pipe runs with `enableImplicitConversion`, which coerces a `boolean`-typed property with
 * a blind `Boolean(value)` *before* validation — and `Boolean("false")` is `true`. Without this,
 * `{"passwordLoginEnabled": "false"}` answered 200 and turned the setting **on**, silently doing
 * the opposite of what was asked, with `@IsBoolean()` none the wiser because by then the value
 * really was a boolean. See `parseBooleanInput`'s own comment for the mechanism.
 */
export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(parseBooleanInput)
  @IsBoolean()
  ssoLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(parseBooleanInput)
  @IsBoolean()
  passwordLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(parseBooleanInput)
  @IsBoolean()
  socialLoginEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(parseBooleanInput)
  @IsBoolean()
  inviteMembersEnabled?: boolean;
}
