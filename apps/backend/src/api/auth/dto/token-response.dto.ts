import { ApiProperty } from '@nestjs/swagger';

import { AuthenticatedUserDto } from './authenticated-user.dto';

/**
 * No `refreshToken` field on purpose: it travels only in an httpOnly cookie, never in a JSON body a
 * script could read.
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
