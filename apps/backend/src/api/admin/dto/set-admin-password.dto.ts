import { OTP_LENGTH, OTP_PATTERN, PASSWORD_PATTERN } from '@auth/constants/auth.constants';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class SetAdminPasswordDto {
  @ApiProperty({
    example: 'NewStr0ng@Pass',
    minLength: 8,
    maxLength: 128,
    description:
      'At least one uppercase letter, one lowercase letter, one digit, and one special ' +
      'character — same policy as `ChangeAdminPasswordDto.newPassword`.',
  })
  @IsString({ message: 'newPassword must be a string' })
  @Length(8, 128, { message: 'newPassword must be between 8 and 128 characters' })
  @Matches(PASSWORD_PATTERN, {
    message:
      'newPassword must contain an uppercase letter, a lowercase letter, a digit, and a special character',
  })
  newPassword!: string;

  @ApiProperty({
    example: '482913',
    minLength: OTP_LENGTH,
    maxLength: OTP_LENGTH,
    pattern: OTP_PATTERN.source,
    description:
      'The 6-digit code emailed to this admin by ' +
      'POST /v1/admin/settings/profile/set-password/request-otp — proof of live mailbox ' +
      'control, since an access token alone is not.',
  })
  @IsString({ message: 'Enter the verification code.' })
  @Length(OTP_LENGTH, OTP_LENGTH, {
    message: `The verification code must be exactly ${OTP_LENGTH} digits.`,
  })
  @Matches(OTP_PATTERN, { message: `The verification code must be exactly ${OTP_LENGTH} digits.` })
  otp!: string;
}
