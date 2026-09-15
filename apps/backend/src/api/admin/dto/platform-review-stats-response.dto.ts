import type { PlatformReviewStats } from '@db/repositories/admin-overview/admin-overview.repository';
import { ApiProperty } from '@nestjs/swagger';

export class PlatformReviewStatsResponseDto {
  @ApiProperty({ example: 4821, description: 'Total reviews synced, across every tenant.' })
  totalReviewsFetched!: number;

  @ApiProperty({
    example: 3660,
    description: 'Total replies actually posted to Google, across every tenant.',
  })
  totalRepliesSent!: number;

  static from(row: PlatformReviewStats): PlatformReviewStatsResponseDto {
    const dto = new PlatformReviewStatsResponseDto();
    dto.totalReviewsFetched = row.totalReviewsFetched;
    dto.totalRepliesSent = row.totalRepliesSent;
    return dto;
  }
}
