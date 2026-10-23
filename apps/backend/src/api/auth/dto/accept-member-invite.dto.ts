import { MaxByteLength } from '@common/validators/max-byte-length.validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

import {
  PASSWORD_MAX_BYTES,
  PASSWORD_PATTERN,
  PASSWORD_TOO_LONG_MESSAGE,
} from '../constants/auth.constants';
import { trimStringInput } from '../utils/string.utils';

/**
 * Unlike `AcceptAdminInviteDto`, carries `name`: `users.name` is NOT NULL and the invite-send form
 * is email-only.
 */
export class AcceptMemberInviteDto {
  @ApiProperty({
    example: 'kx7F2m9pQnR4vL8wZs1cYb3dEaJhTgUo',
    description:
      "The raw invite token from the accept-invite link — the same value the URL's `:token` segment carries.",
  })
  @IsString({ message: 'token must be a string' })
  @Length(1, 512, { message: 'token is required' })
  token!: string;

  @ApiProperty({
    example: 'Sam Rivera',
    minLength: 1,
    maxLength: 255,
    description: 'Leading/trailing whitespace is trimmed before validation.',
  })
  @Transform(({ value }: { value: unknown }) => trimStringInput(value))
  @IsString({ message: 'Enter your full name.' })
  @Length(1, 255, { message: 'Your name must be between 1 and 255 characters.' })
  name!: string;

  @ApiProperty({
    example: 'NewStr0ng@Pass',
    minLength: 8,
    maxLength: PASSWORD_MAX_BYTES,
    description:
      'At least one uppercase letter, one lowercase letter, one digit, and one special ' +
      'character (any non-alphanumeric, non-whitespace character — `#`, `-`, `_`, `~`, … all count).',
  })
  @IsString({ message: 'password must be a string' })
  @Length(8, 128, { message: 'password must be between 8 and 128 characters' })
  @MaxByteLength(PASSWORD_MAX_BYTES, { message: PASSWORD_TOO_LONG_MESSAGE })
  @Matches(PASSWORD_PATTERN, {
    message:
      'password must contain an uppercase letter, a lowercase letter, a digit, and a special character',
  })
  password!: string;
}
