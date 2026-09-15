import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { toIsoString } from '@common/helpers/date.utils';
import type { PlatformActivityRow } from '@db/repositories/admin-overview/admin-overview.repository';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformActivityResponseDto {
  @ApiProperty({ example: '0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33' })
  id!: string;

  @ApiProperty({ example: PlatformActivityType.BUSINESS_SUSPENDED, enum: PlatformActivityType })
  type!: PlatformActivityType;

  @ApiProperty({ example: 'admin@innopeak.com' })
  actorEmail!: string;

  @ApiPropertyOptional({
    example: 'Oak & Iron Hardware',
    type: String,
    nullable: true,
    description: 'Set for business_suspended/business_reactivated entries only.',
  })
  businessName!: string | null;

  @ApiPropertyOptional({
    example: 'priya.ops@innopeak.com',
    type: String,
    nullable: true,
    description: 'Set for admin_invite_sent/admin_invite_revoked entries only.',
  })
  email!: string | null;

  @ApiProperty({ example: '2026-09-11T09:12:00.000Z' })
  occurredAt!: string;

  static from(row: PlatformActivityRow): PlatformActivityResponseDto {
    const dto = new PlatformActivityResponseDto();
    dto.id = row.id;
    dto.type = row.type;
    dto.actorEmail = row.actorEmail;
    dto.businessName = row.businessName;
    dto.email = row.targetEmail;
    dto.occurredAt = toIsoString(row.occurredAt);
    return dto;
  }
}
