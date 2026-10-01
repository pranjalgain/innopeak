import { ReviewClassification } from '@common/enums/review-classification.enum';
import type {
  AdminStatisticsSummary,
  ClassificationBreakdownRow,
  ConnectionHealthCounts,
  RatingDistributionRow,
  ReviewsTrendPoint,
} from '@db/repositories/admin-statistics/types/admin-statistics.type';
import { ApiProperty } from '@nestjs/swagger';

/** Nested value objects for `AdminStatisticsSummaryResponseDto` — co-located rather than one file
 *  each, since none of the three is meaningful or reused outside this one parent response. */
export class ReviewsTrendPointResponseDto {
  @ApiProperty({ example: '2026-09', description: 'Calendar month, `YYYY-MM`, zero-padded.' })
  monthKey!: string;

  @ApiProperty({ example: 812, description: 'Reviews synced that month. Zero if none were.' })
  reviewsFetched!: number;

  @ApiProperty({
    example: 640,
    description: 'Replies actually posted to Google that month (by post date, not draft date).',
  })
  repliesSent!: number;

  static from(point: ReviewsTrendPoint): ReviewsTrendPointResponseDto {
    const dto = new ReviewsTrendPointResponseDto();
    dto.monthKey = `${point.year}-${String(point.month).padStart(2, '0')}`;
    dto.reviewsFetched = point.reviewsFetched;
    dto.repliesSent = point.repliesSent;
    return dto;
  }
}

export class RatingDistributionPointResponseDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ example: 2140 })
  count!: number;

  static from(row: RatingDistributionRow): RatingDistributionPointResponseDto {
    const dto = new RatingDistributionPointResponseDto();
    dto.rating = row.rating;
    dto.count = row.count;
    return dto;
  }
}

export class ClassificationBreakdownPointResponseDto {
  @ApiProperty({ example: ReviewClassification.AUTO_REPLY_CANDIDATE, enum: ReviewClassification })
  classification!: ReviewClassification;

  @ApiProperty({ example: 3980 })
  count!: number;

  static from(row: ClassificationBreakdownRow): ClassificationBreakdownPointResponseDto {
    const dto = new ClassificationBreakdownPointResponseDto();
    dto.classification = row.classification;
    dto.count = row.count;
    return dto;
  }
}

export class ConnectionHealthResponseDto {
  @ApiProperty({ example: 108, description: 'Tenants whose most recent connection is healthy.' })
  connected!: number;

  @ApiProperty({ example: 6, description: 'Tenants whose most recent connection needs re-auth.' })
  needsReauth!: number;

  @ApiProperty({
    example: 4,
    description: 'Tenants that had a working connection and lost it (owner action or revocation).',
  })
  disconnected!: number;

  @ApiProperty({ example: 10, description: 'Tenants that never finished connecting a business.' })
  neverConnected!: number;

  static from(counts: ConnectionHealthCounts): ConnectionHealthResponseDto {
    const dto = new ConnectionHealthResponseDto();
    dto.connected = counts.connected;
    dto.needsReauth = counts.needsReauth;
    dto.disconnected = counts.disconnected;
    dto.neverConnected = counts.neverConnected;
    return dto;
  }
}

export class AdminStatisticsSummaryResponseDto {
  @ApiProperty({ example: 75.9, description: 'totalRepliesSent / totalReviewsFetched * 100.' })
  replyRatePercent!: number;

  @ApiProperty({ example: 4.2, description: 'Average `reviews.rating` across every tenant.' })
  avgRating!: number;

  @ApiProperty({
    example: 96.4,
    description:
      'Share of completed (non-`running`) sync_runs that ended `ok` rather than `error`, ' +
      'platform-wide.',
  })
  syncSuccessRatePercent!: number;

  @ApiProperty({ type: ConnectionHealthResponseDto })
  connectionHealth!: ConnectionHealthResponseDto;

  @ApiProperty({
    type: [ReviewsTrendPointResponseDto],
    description: 'Oldest month first, covering the trailing `months` window (see the query param).',
  })
  reviewsTrend!: ReviewsTrendPointResponseDto[];

  @ApiProperty({
    type: [RatingDistributionPointResponseDto],
    description: 'All five ratings always present, in ascending order, zero-filled where unused.',
  })
  ratingDistribution!: RatingDistributionPointResponseDto[];

  @ApiProperty({
    type: [ClassificationBreakdownPointResponseDto],
    description: 'All three classifications always present, zero-filled where unused.',
  })
  classificationBreakdown!: ClassificationBreakdownPointResponseDto[];

  static from(summary: AdminStatisticsSummary): AdminStatisticsSummaryResponseDto {
    const dto = new AdminStatisticsSummaryResponseDto();
    dto.replyRatePercent = summary.replyRatePercent;
    dto.avgRating = summary.avgRating;
    dto.syncSuccessRatePercent = summary.syncSuccessRatePercent;
    dto.connectionHealth = ConnectionHealthResponseDto.from(summary.connectionHealth);
    dto.reviewsTrend = summary.reviewsTrend.map(point => ReviewsTrendPointResponseDto.from(point));
    dto.ratingDistribution = summary.ratingDistribution.map(row =>
      RatingDistributionPointResponseDto.from(row)
    );
    dto.classificationBreakdown = summary.classificationBreakdown.map(row =>
      ClassificationBreakdownPointResponseDto.from(row)
    );
    return dto;
  }
}
