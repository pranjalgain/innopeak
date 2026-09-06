import { ApiProperty } from '@nestjs/swagger';

import { AuthenticatedUserDto } from './authenticated-user.dto';

/**
 * Shared success shape for verify-email, login, and refresh — all end in a fully authenticated
 * session. Deliberately has NO `refreshToken` field — it travels only in an httpOnly
 * `refresh_token` cookie (see `AuthController`'s cookie helpers), never in a JSON body a script
 * on the page could read.
 */
export class TokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Access token TTL, in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: AuthenticatedUserDto })
  user!: AuthenticatedUserDto;

  @ApiProperty({
    example: false,
    description:
      'Whether this tenant has connected a Google Business Profile — the frontend routes to the ' +
      'connect stepper instead of the dashboard when this is false.',
  })
  hasConnectedBusiness!: boolean;
}
