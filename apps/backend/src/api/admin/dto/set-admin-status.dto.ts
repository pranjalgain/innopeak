import { parseBooleanInput } from '@common/helpers/boolean.utils';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/**
 * `PATCH /v1/admin/settings/admins/:adminId/status` — disable (`false`) or re-enable (`true`) a
 * platform admin. `@Transform(parseBooleanInput)` for the same reason the platform-settings DTO
 * needs it: the global pipe's implicit conversion turns `"false"` into `true` before validation, so
 * a raw boolean coercion would silently re-enable an admin the caller meant to disable.
 */
export class SetAdminStatusDto {
  @ApiProperty({
    example: false,
    description: 'true re-enables the admin (status → active), false disables them.',
  })
  @Transform(parseBooleanInput)
  @IsBoolean()
  enabled!: boolean;
}
