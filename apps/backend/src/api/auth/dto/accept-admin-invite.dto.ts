import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

import { PASSWORD_PATTERN } from '../constants/auth.constants';

export class AcceptAdminInviteDto {
  @ApiProperty({
    example: 'kx7F2m9pQnR4vL8wZs1cYb3dEaJhTgUo',
    description:
      "The raw invite token from the accept-invite link — the same value the URL's `:token` segment carries.",
  })
  @IsString({ message: 'token must be a string' })
  @Length(1, 512, { message: 'token is required' })
  token!: string;

  @ApiProperty({
    example: 'NewStr0ng@Pass',
    minLength: 8,
    maxLength: 128,
    description:
      'At least one uppercase letter, one lowercase letter, one digit, and one special ' +
      'character (any non-alphanumeric, non-whitespace character — `#`, `-`, `_`, `~`, … all count).',
  })
  @IsString({ message: 'password must be a string' })
  @Length(8, 128, { message: 'password must be between 8 and 128 characters' })
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain an uppercase letter, a lowercase letter, a digit, and a special character',
  })
  password!: string;
}
