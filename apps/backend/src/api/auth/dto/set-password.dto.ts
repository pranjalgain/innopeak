import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

import { PASSWORD_PATTERN } from '../constants/auth.constants';

export class SetPasswordDto {
  @ApiProperty({
    example: 'NewStr0ng@Pass',
    minLength: 8,
    maxLength: 128,
    description:
      'At least one uppercase letter, one lowercase letter, one digit, and one special ' +
      'character (any non-alphanumeric, non-whitespace character — `#`, `-`, `_`, `~`, … all count).',
  })
  @IsString({ message: 'newPassword must be a string' })
  @Length(8, 128, { message: 'newPassword must be between 8 and 128 characters' })
  @Matches(PASSWORD_PATTERN, {
    message:
      'newPassword must contain an uppercase letter, a lowercase letter, a digit, and a special character',
  })
  newPassword!: string;
}
