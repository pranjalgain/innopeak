import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

/** A Checkout Session id is opaque and provider-defined, so no `cs_...` shape check; the provider decides what an unknown id means. */
export class ReconcileCheckoutSessionDto {
  @ApiProperty({ example: 'cs_test_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6' })
  @IsString()
  @MinLength(1, { message: 'checkoutSessionId must not be empty' })
  // Charset and length bound only; arbitrary input would otherwise reach Stripe and surface as a 500.
  @Matches(/^[A-Za-z0-9_-]{1,255}$/, { message: 'checkoutSessionId is not a valid session id.' })
  checkoutSessionId!: string;
}
