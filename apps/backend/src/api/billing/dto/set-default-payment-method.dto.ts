import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetDefaultPaymentMethodDto {
  /** The Stripe PaymentMethod id (`pm_...`) `stripe.confirmCardSetup` returned client-side, once
   *  the SetupIntent for it succeeded — never the raw card itself. */
  @ApiProperty({ example: 'pm_1P0a2bC3dE4fG5h' })
  @IsString()
  @IsNotEmpty({ message: 'A payment method id is required.' })
  paymentMethodId!: string;
}
