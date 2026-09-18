import { type Locale, SUPPORTED_LOCALES } from '@common/i18n/locale';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Deliberately as narrow as `PlatformAdminAuthUser`'s identity fields — no `role`/`tenantId`,
 * since a platform admin sits outside the tenant hierarchy entirely (see `RolesGuard`'s "flat
 * hierarchy" comment: a platform-admin token has no role at all and fails closed on any
 * `@Roles()` route).
 */
export class PlatformAdminSummaryDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'admin@innopeak.com' })
  email!: string;

  /**
   * Mirrors `AuthenticatedUserDto.locale` on the tenant side. Returned on sign-in so the client
   * can restore the admin's saved language immediately: the UI reads its locale from a
   * client-side cookie, which a new device or a cleared browser does not have, while the backend
   * localizes its own messages from the token claim regardless. Without handing this back there
   * is no way for the two to agree on that first visit — the chrome would render in the default
   * language while every API message came back in the stored one.
   */
  @ApiProperty({ enum: SUPPORTED_LOCALES, nullable: true, example: 'de' })
  locale!: Locale | null;
}
