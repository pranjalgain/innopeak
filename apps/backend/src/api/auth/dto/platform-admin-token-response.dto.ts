import { ApiProperty } from '@nestjs/swagger';

import { PlatformAdminSummaryDto } from './platform-admin-summary.dto';

/**
 * Narrower than `TokenResponseDto`: no `refreshToken` cookie (admin sessions are access-token-only)
 * and no `hasConnectedBusiness` (a tenant concept).
 */
export class PlatformAdminTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Access token TTL, in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: PlatformAdminSummaryDto })
  admin!: PlatformAdminSummaryDto;
}
