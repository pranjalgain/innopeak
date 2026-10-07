import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import { OTP_LENGTH, OTP_PATTERN } from '../constants/auth.constants';

export class DeleteAccountDto {
  @ApiProperty({
    example: 'Acme Dental',
    description: "The business's name, typed exactly — a deliberate confirmation, not a checkbox.",
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Type the business name to confirm.' })
  @Length(1, 200, { message: 'Type the business name to confirm.' })
  businessName!: string;

  @ApiPropertyOptional({
    example: 'Str0ng@Pass',
    description: 'Required for an owner who has a password; omitted by one who signed in with SSO.',
  })
  @IsOptional()
  @IsString({ message: 'password must be a string' })
  @MaxLength(128, { message: 'password must be at most 128 characters' })
  password?: string;

  @ApiPropertyOptional({
    example: '482913',
    pattern: OTP_PATTERN.source,
    description:
      'The 6-digit code emailed by POST /v1/auth/delete-account/request-otp. Required for an ' +
      'owner without a password; ignored otherwise.',
  })
  @IsOptional()
  @IsString({ message: 'Enter the verification code.' })
  @Length(OTP_LENGTH, OTP_LENGTH, {
    message: `The verification code must be exactly ${OTP_LENGTH} digits.`,
  })
  @Matches(OTP_PATTERN, { message: `The verification code must be exactly ${OTP_LENGTH} digits.` })
  otp?: string;
}
