import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SetDefaultPaymentMethodDto {
  /** Stripe PaymentMethod id (`pm_...`) from confirmCardSetup; never the raw card. */
  @ApiProperty({ example: 'pm_1P0a2bC3dE4fG5h' })
  @IsString()
  @IsNotEmpty({ message: 'A payment method id is required.' })
  // Implicit conversion turns `123`, `true` or `{}` into a string before @IsString() runs; the shape check
  // rejects them instead of letting Stripe answer with a 500.
  @Matches(/^pm_[A-Za-z0-9]{1,250}$/, { message: 'Enter a valid payment method id.' })
  paymentMethodId!: string;
}
