import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

import { PASSWORD_PATTERN } from '../constants/auth.constants';
import { normalizeEmailInput } from '../utils/email.utils';
import { trimStringInput } from '../utils/string.utils';

export class SignupDto {
  @ApiProperty({
    example: 'The Coffee House',
    minLength: 1,
    maxLength: 255,
    description:
      'The tenant/company name — a stable identifier for the account, distinct from ' +
      '`locations.name` (the per-location name synced from a connected Google Business ' +
      'Profile). One tenant can have several locations, so the tenant name can never be ' +
      'derived from a single location connection; it has to be collected directly. ' +
      'Leading/trailing whitespace is trimmed before validation.',
  })
  @Transform(({ value }: { value: unknown }) => trimStringInput(value))
  @IsString({ message: 'businessName must be a string' })
  @Length(1, 255, { message: 'businessName must be between 1 and 255 characters' })
  businessName!: string;

  @ApiProperty({
    example: 'Jane Doe',
    minLength: 1,
    maxLength: 255,
    description: 'Leading/trailing whitespace is trimmed before validation.',
  })
  @Transform(({ value }: { value: unknown }) => trimStringInput(value))
  @IsString({ message: 'ownerName must be a string' })
  @Length(1, 255, { message: 'ownerName must be between 1 and 255 characters' })
  ownerName!: string;

  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  @Transform(({ value }: { value: unknown }) => normalizeEmailInput(value))
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @ApiProperty({
    example: 'StrongP@ss1',
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
