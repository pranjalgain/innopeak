import { ApiProperty } from '@nestjs/swagger';

/**
 * Login's `pending_verification` branch — not an error. This account exists and the password
 * was correct, but it never finished signup verification, so a fresh OTP has just been sent and
 * the frontend should render the same OTP stepper the signup wizard uses.
 */
export class LoginPendingVerificationDto {
  @ApiProperty({ example: 'pending_verification' })
  status!: 'pending_verification';

  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  email!: string;

  @ApiProperty({ example: 'Verification code sent to jane@thecoffeehouse.com' })
  message!: string;
}
