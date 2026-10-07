import { type Locale, SUPPORTED_LOCALES } from '@common/i18n/locale';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Deliberately narrow: no `role`/`tenantId`, since a platform admin sits outside the tenant
 * hierarchy.
 */
export class PlatformAdminSummaryDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'admin@innopeak.com' })
  email!: string;

  /**
   * Returned on sign-in so the client can restore the saved language: the UI reads locale from a
   * client-side cookie that a new device lacks, while the backend localizes from the token claim.
   */
  @ApiProperty({ enum: SUPPORTED_LOCALES, nullable: true, example: 'de' })
  locale!: Locale | null;
}
