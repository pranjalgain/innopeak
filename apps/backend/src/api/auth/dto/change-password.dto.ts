import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

import { PASSWORD_PATTERN } from '../constants/auth.constants';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'StrongP@ss1',
    minLength: 1,
    maxLength: 128,
    description:
      'The caller’s current password. Complexity is not re-checked — an older password that ' +
      'would fail today’s policy must still be accepted as proof of identity.',
  })
  @IsString({ message: 'currentPassword must be a string' })
  @Length(1, 128, { message: 'currentPassword must be between 1 and 128 characters' })
  currentPassword!: string;

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
