import { ApiProperty } from '@nestjs/swagger';

import { AdminProfileResponseDto } from './admin-profile-response.dto';

/** Reissues the access token alone; a platform admin has no refresh token. */
export class UpdateAdminLocaleResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Access token TTL, in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: AdminProfileResponseDto })
  admin!: AdminProfileResponseDto;
}
