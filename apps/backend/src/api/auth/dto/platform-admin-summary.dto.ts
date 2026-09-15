import { ApiProperty } from '@nestjs/swagger';

/**
 * Deliberately as narrow as `PlatformAdminAuthUser` itself — no `role`/`tenantId`, since a
 * platform admin sits outside the tenant hierarchy entirely (see `RolesGuard`'s "flat hierarchy"
 * comment: a platform-admin token has no role at all and fails closed on any `@Roles()` route).
 */
export class PlatformAdminSummaryDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'admin@innopeak.com' })
  email!: string;
}
