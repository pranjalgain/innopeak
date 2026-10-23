import { parseBooleanInput } from '@common/helpers/boolean.utils';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ToggleAdminUserActiveQueryDto {
  @ApiPropertyOptional({
    example: false,
    description:
      'The state to put the user in: `true` active, `false` deactivated. Already there, nothing changes (and nothing is logged), ' +
      'so a stale list or a double click cannot undo an earlier action. Omitted, the user is flipped from whatever they are now.',
  })
  @IsOptional()
  @Transform(parseBooleanInput)
  @IsBoolean({ message: 'active must be true or false' })
  active?: boolean;
}
