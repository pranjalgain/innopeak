import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';

import { MfaType } from './mfa-setup.dto';

export class MfaVerifyDto {
  @ApiProperty({
    description: 'MFA verification code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'MFA code is required' })
  @Length(6, 6, { message: 'MFA code must be exactly 6 digits' })
  code!: string;

  @ApiProperty({
    description: 'Type of MFA being verified',
    enum: MfaType,
    example: MfaType.TOTP,
  })
  @IsEnum(MfaType, { message: 'MFA type must be either totp or sms' })
  @IsNotEmpty({ message: 'MFA type is required' })
  type!: MfaType;
}
