import { PaginationMetaDto } from '@common/dto/pagination-meta.dto';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { toIsoString } from '@common/helpers/date.utils';
import type { AdminBusinessSummary } from '@db/repositories/admin-businesses/types/admin-businesses.type';
import type { PlatformActivityRow } from '@db/repositories/admin-overview/types/admin-overview.type';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Not a real `platform_activity_type`: a signup has no platform-admin actor. Synthesized from
 *  `AdminBusinessSummary.createdAt` and merged into the recent-activity feed. */
export const BUSINESS_JOINED_TYPE = 'business_joined';

export class PlatformActivityResponseDto {
  @ApiProperty({ example: '0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33' })
  id!: string;

  @ApiProperty({
    example: PlatformActivityType.BUSINESS_SUSPENDED,
    enum: [...Object.values(PlatformActivityType), BUSINESS_JOINED_TYPE],
  })
  type!: PlatformActivityType | typeof BUSINESS_JOINED_TYPE;

  @ApiPropertyOptional({
    example: 'admin@innopeak.com',
    type: String,
    nullable: true,
    description: 'Null for a synthesized business_joined entry — see its own comment.',
  })
  actorEmail!: string | null;

  @ApiPropertyOptional({
    example: 'Oak & Iron Hardware',
    type: String,
    nullable: true,
    description: 'Set for business_suspended/business_reactivated/business_joined entries only.',
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

  static fromBusinessJoined(business: AdminBusinessSummary): PlatformActivityResponseDto {
    const dto = new PlatformActivityResponseDto();
    dto.id = `business-joined-${business.id}`;
    dto.type = BUSINESS_JOINED_TYPE;
    dto.actorEmail = null;
    dto.businessName = business.name;
    dto.email = null;
    dto.occurredAt = business.createdAt;
    return dto;
  }
}

export class PlatformActivityListResponseDto {
  @ApiProperty({ type: [PlatformActivityResponseDto], description: 'Newest first.' })
  activities!: PlatformActivityResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
