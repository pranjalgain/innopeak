import { ApiProperty } from '@nestjs/swagger';

import { PlatformAdminSummaryDto } from './platform-admin-summary.dto';

/**
 * Login's platform-admin branch. Deliberately narrower than `TokenResponseDto`: no `refreshToken`
 * cookie is set for this principal type (see `TokenService.signPlatformAdminAccessToken`'s doc
 * comment for why v1 ships access-token-only), and no `hasConnectedBusiness` — that concept is
 * scoped to a tenant, and a platform admin has none.
 */
export class PlatformAdminTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken!: string;

  @ApiProperty({ example: 900, description: 'Access token TTL, in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: PlatformAdminSummaryDto })
  admin!: PlatformAdminSummaryDto;
}
