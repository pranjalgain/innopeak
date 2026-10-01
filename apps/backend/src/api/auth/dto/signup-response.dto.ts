import type { SignupResult } from '@db/repositories/auth/types/auth.type';
import { ApiProperty } from '@nestjs/swagger';

import { UserStatus } from '../enums/user-status.enum';

export class SignupResponseDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  tenantId!: string;

  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  userId!: string;

  @ApiProperty({
    example: UserStatus.PENDING_VERIFICATION,
    enum: [UserStatus.PENDING_VERIFICATION],
  })
  status!: UserStatus.PENDING_VERIFICATION;

  @ApiProperty({ example: 'Verification code sent to jane@thecoffeehouse.com' })
  message!: string;

  static from(result: SignupResult, message: string): SignupResponseDto {
    const dto = new SignupResponseDto();
    dto.tenantId = result.tenantId;
    dto.userId = result.userId;
    dto.status = result.status;
    dto.message = message;
    return dto;
  }
}
