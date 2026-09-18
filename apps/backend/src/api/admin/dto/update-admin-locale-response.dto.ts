import { ApiProperty } from '@nestjs/swagger';

import { AdminProfileResponseDto } from './admin-profile-response.dto';

/**
 * The platform-admin counterpart to `UpdateLocaleResponseDto` — deliberately narrower than
 * `PlatformAdminTokenResponseDto` for the same reason that one is narrower than
 * `TokenResponseDto`: this reissues the access token alone (see
 * `TokenService.signPlatformAdminAccessToken`, reused here as the reissue primitive since a
 * platform admin has no refresh token to leave untouched in the first place).
 */
export class UpdateAdminLocaleResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Access token TTL, in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: AdminProfileResponseDto })
  admin!: AdminProfileResponseDto;
}
