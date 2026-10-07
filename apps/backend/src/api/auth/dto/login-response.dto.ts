import { ApiProperty } from '@nestjs/swagger';

import { UserStatus } from '../enums/user-status.enum';

/**
 * Not an error: the password was correct but signup verification never finished, so a fresh OTP was
 * sent and the frontend shows the OTP stepper.
 */
export class LoginPendingVerificationDto {
  @ApiProperty({
    example: UserStatus.PENDING_VERIFICATION,
    enum: [UserStatus.PENDING_VERIFICATION],
  })
  status!: UserStatus.PENDING_VERIFICATION;

  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  email!: string;

  @ApiProperty({ example: 'Verification code sent to jane@thecoffeehouse.com' })
  message!: string;
}
