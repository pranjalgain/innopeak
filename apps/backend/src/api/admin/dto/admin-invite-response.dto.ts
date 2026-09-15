import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { toIsoString, toIsoStringOrNull } from '@common/helpers/date.utils';
import type { PlatformAdminInviteRow } from '@db/repositories/platform-admin/platform-admin.repository';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminInviteResponseDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'priya.ops@innopeak.com' })
  email!: string;

  @ApiProperty({ example: PlatformAdminStatus.INVITED, enum: PlatformAdminStatus })
  status!: PlatformAdminStatus;

  @ApiProperty({ example: '2026-03-01T09:12:00.000Z' })
  invitedAt!: string;

  @ApiPropertyOptional({
    example: '2026-03-08T09:12:00.000Z',
    type: String,
    nullable: true,
    description:
      'When the pending invite lapses. `null` for an admin that was never invited — the seeded ' +
      'root admin — since there is no invite to expire.',
  })
  expiresAt!: string | null;

  static from(row: PlatformAdminInviteRow): AdminInviteResponseDto {
    const dto = new AdminInviteResponseDto();
    dto.id = row.id;
    dto.email = row.email;
    dto.status = row.status;
    dto.invitedAt = toIsoString(row.invitedAt);
    // Passed through as null rather than back-filled from `invitedAt`. The old fallback made the
    // never-invited root admin report an expiry equal to its own creation time — a date in the
    // past, indistinguishable from a genuinely lapsed invite by anything reading this field.
    dto.expiresAt = toIsoStringOrNull(row.expiresAt);
    return dto;
  }
}
