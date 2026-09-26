import { ApiProperty } from '@nestjs/swagger';

/** Shared shape for both `POST /v1/billing/checkout` and `POST /v1/billing/portal` — a redirect
 *  URL the frontend navigates the browser to, real (Stripe) or simulated (Dummy). */
export class RedirectUrlResponseDto {
  @ApiProperty({ example: 'https://checkout.stripe.com/c/pay/cs_test_...' })
  url!: string;

  static from(url: string): RedirectUrlResponseDto {
    const dto = new RedirectUrlResponseDto();
    dto.url = url;
    return dto;
  }
}
