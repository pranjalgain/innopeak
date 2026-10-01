import type { AdminOverviewStats } from '@db/repositories/admin-overview/types/admin-overview.type';
import { ApiProperty } from '@nestjs/swagger';

export class AdminOverviewStatsResponseDto {
  @ApiProperty({
    example: 128,
    description: 'Total tenants (businesses), across the whole platform.',
  })
  businessCount!: number;

  @ApiProperty({ example: 412, description: 'Total non-anonymized users, across every tenant.' })
  userCount!: number;

  @ApiProperty({ example: 4821, description: 'Total reviews synced, across every tenant.' })
  totalReviewsFetched!: number;

  @ApiProperty({
    example: 3660,
    description: 'Total replies actually posted to Google, across every tenant.',
  })
  totalRepliesSent!: number;

  static from(stats: AdminOverviewStats): AdminOverviewStatsResponseDto {
    const dto = new AdminOverviewStatsResponseDto();
    dto.businessCount = stats.businessCount;
    dto.userCount = stats.userCount;
    dto.totalReviewsFetched = stats.totalReviewsFetched;
    dto.totalRepliesSent = stats.totalRepliesSent;
    return dto;
  }
}
