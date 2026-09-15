import type { PlatformAdminProfileRow } from '@db/repositories/platform-admin/platform-admin.repository';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminProfileResponseDto {
  @ApiProperty({ example: 'admin@innopeak.com' })
  email!: string;

  @ApiPropertyOptional({ example: null, type: String, nullable: true })
  avatarUrl!: string | null;

  static from(row: PlatformAdminProfileRow): AdminProfileResponseDto {
    const dto = new AdminProfileResponseDto();
    dto.email = row.email;
    dto.avatarUrl = row.avatarUrl;
    return dto;
  }
}
