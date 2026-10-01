import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { TenantSettingsRecord } from '../types/settings.type';

export class TenantSettingsResponseDto {
  @ApiProperty({ example: '0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33' })
  id!: string;

  @ApiProperty({ example: 3 })
  escalationRatingThreshold!: number;

  @ApiProperty({ example: false })
  autoPostEnabled!: boolean;

  @ApiPropertyOptional({ example: 24, type: Number, nullable: true })
  reviewDataRetentionMonths!: number | null;

  @ApiProperty({ example: 1, minimum: 1, maximum: 3 })
  aiReplyCount!: number;

  @ApiProperty({ example: '2026-08-28T09:12:44.000Z' })
  updatedAt!: string;

  static from(row: TenantSettingsRecord): TenantSettingsResponseDto {
    const dto = new TenantSettingsResponseDto();
    dto.id = row.id;
    dto.escalationRatingThreshold = row.escalationRatingThreshold;
    dto.autoPostEnabled = row.autoPostEnabled;
    dto.reviewDataRetentionMonths = row.reviewDataRetentionMonths;
    dto.aiReplyCount = row.aiReplyCount;
    dto.updatedAt = row.updatedAt;
    return dto;
  }
}
