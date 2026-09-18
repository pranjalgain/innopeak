import { type Locale, SUPPORTED_LOCALES } from '@common/i18n/locale';
import type { PlatformAdminProfileRow } from '@db/repositories/platform-admin/platform-admin.repository';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminProfileResponseDto {
  @ApiProperty({ example: 'admin@innopeak.com' })
  email!: string;

  @ApiPropertyOptional({ example: null, type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({
    example: 'en',
    enum: SUPPORTED_LOCALES,
    nullable: true,
    description:
      'The stored `platform_admins.locale` preference, or null when the admin has never set ' +
      "one — in which case the API falls back to negotiating the caller's `Accept-Language` " +
      'header per request rather than defaulting silently to English.',
  })
  locale!: Locale | null;

  static from(row: PlatformAdminProfileRow): AdminProfileResponseDto {
    const dto = new AdminProfileResponseDto();
    dto.email = row.email;
    dto.avatarUrl = row.avatarUrl;
    dto.locale = row.locale;
    return dto;
  }
}
