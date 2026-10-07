import { parseBooleanInput } from '@common/helpers/boolean.utils';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/** `@Transform(parseBooleanInput)`: implicit conversion turns `"false"` into `true`, which would re-enable an admin meant to be disabled. */
export class SetAdminStatusDto {
  @ApiProperty({
    example: false,
    description: 'true re-enables the admin (status → active), false disables them.',
  })
  @Transform(parseBooleanInput)
  @IsBoolean()
  enabled!: boolean;
}
