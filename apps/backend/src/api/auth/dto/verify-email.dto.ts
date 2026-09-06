import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

import { OTP_LENGTH, OTP_PATTERN } from '../constants/auth.constants';
import { normalizeEmailInput } from '../utils/email.utils';

export class VerifyEmailDto {
  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  @Transform(({ value }: { value: unknown }) => normalizeEmailInput(value))
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @ApiProperty({
    example: '482913',
    minLength: OTP_LENGTH,
    maxLength: OTP_LENGTH,
    pattern: OTP_PATTERN.source,
    description: 'The 6-digit verification code emailed to this address.',
  })
  @IsString({ message: 'otp must be a string' })
  @Length(OTP_LENGTH, OTP_LENGTH, { message: `otp must be exactly ${OTP_LENGTH} digits` })
  @Matches(OTP_PATTERN, { message: `otp must be exactly ${OTP_LENGTH} digits` })
  otp!: string;
}
