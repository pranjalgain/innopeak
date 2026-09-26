import { ApiProperty } from '@nestjs/swagger';

export class SetupIntentResponseDto {
  /** Safe to hand to the browser — this is what Stripe.js needs to collect the card and confirm
   *  the SetupIntent client-side; the raw card itself never reaches this backend. */
  @ApiProperty({ example: 'seti_1P0a2bC3dE4fG5h_secret_ABC123' })
  clientSecret!: string;

  static from(clientSecret: string): SetupIntentResponseDto {
    const dto = new SetupIntentResponseDto();
    dto.clientSecret = clientSecret;
    return dto;
  }
}
