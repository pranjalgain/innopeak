import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export enum MfaType {
  TOTP = 'totp',
  SMS = 'sms',
}

export class MfaSetupDto {
  @ApiProperty({
    description: 'Type of MFA to set up',
    enum: MfaType,
    example: MfaType.TOTP,
  })
  @IsEnum(MfaType, { message: 'MFA type must be either totp or sms' })
  @IsNotEmpty({ message: 'MFA type is required' })
  type!: MfaType;
}
