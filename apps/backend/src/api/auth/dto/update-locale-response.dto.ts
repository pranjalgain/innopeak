import { ApiProperty } from '@nestjs/swagger';

import { AuthenticatedUserDto } from './authenticated-user.dto';

/**
 * Deliberately narrower than `TokenResponseDto`: this reissues the access token alone (see
 * `TokenService.reissueAccessToken`), never a refresh token, so there is no `refresh_token` cookie
 * rotation to describe here and no `hasConnectedBusiness` (unchanged by a locale update).
 */
export class UpdateLocaleResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Access token TTL, in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: AuthenticatedUserDto })
  user!: AuthenticatedUserDto;
}
