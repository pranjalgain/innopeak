import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewSentiment } from '@common/enums/review-sentiment.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ClientResponseStatus } from '../enums/client-response-status.enum';

export class LatestResponseDto {
  @ApiProperty({ example: '0190f3b2-8a03-7c55-b2d7-6e1f0a9c4b58' })
  id!: string;

  @ApiProperty({
    example: ClientResponseStatus.APPROVED,
    enum: ClientResponseStatus,
  })
  status!: ClientResponseStatus;

  @ApiProperty({ example: ResponseType.IMPORTED_REPLY, enum: ResponseType })
  responseType!: ResponseType;

  @ApiProperty({ example: ResponseSource.IMPORTED, enum: ResponseSource })
  source!: ResponseSource;

  @ApiProperty({ example: '2026-03-12T09:01:11.402Z' })
  createdAt!: string;
}

export class ReviewListItemDto {
  @ApiProperty({ example: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22' })
  id!: string;

  @ApiProperty({ example: '0190f3a9-1d22-7b4c-8e11-9c2f4a7b6d03' })
  locationId!: string;

  @ApiPropertyOptional({ example: 'Marta Kowalska', nullable: true })
  reviewerName!: string | null;

  @ApiProperty({ example: 5 })
  rating!: number;

  @ApiPropertyOptional({ example: 'Best cioppino on the harbour.', nullable: true })
  reviewText!: string | null;

  @ApiPropertyOptional({ example: '2026-03-11T18:22:04.129Z', nullable: true })
  reviewedAt!: string | null;

  @ApiPropertyOptional({ example: ReviewSentiment.POSITIVE, enum: ReviewSentiment, nullable: true })
  sentiment!: ReviewSentiment | null;

  @ApiProperty({ example: ReviewClassification.PENDING_CLASSIFICATION, enum: ReviewClassification })
  classification!: ReviewClassification;

  @ApiPropertyOptional({ example: null, enum: EscalationReason, nullable: true })
  escalationReason!: EscalationReason | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  matchedKeywords!: unknown;

  @ApiProperty({ example: ReviewStatus.RESPONDED, enum: ReviewStatus })
  status!: ReviewStatus;

  @ApiPropertyOptional({ example: null, nullable: true })
  anonymizedAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  removedUpstreamAt!: string | null;

  @ApiProperty({ example: 1 })
  responseCount!: number;

  @ApiPropertyOptional({ type: LatestResponseDto, nullable: true })
  latestResponse!: LatestResponseDto | null;
}

export class ReviewsMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 20 })
  total!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

export class ReviewListResponseDto {
  @ApiProperty({ type: [ReviewListItemDto] })
  data!: ReviewListItemDto[];

  @ApiProperty({
    type: ReviewsMetaDto,
    description:
      'Nested inside data — TransformInterceptor rebuilds the envelope and drops a top-level meta.',
  })
  meta!: ReviewsMetaDto;
}

export class ReviewResponseItemDto {
  @ApiProperty({ example: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64' })
  id!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  generationGroupId!: string | null;

  @ApiProperty({
    example: 'A',
    description:
      "Derived from position within generationGroupId, not a column. A null-group row gets 'A'.",
  })
  label!: string;

  @ApiProperty({ example: ResponseType.IMPORTED_REPLY, enum: ResponseType })
  responseType!: ResponseType;

  @ApiProperty({ example: 'Thank you Marta — see you next weekend!' })
  content!: string;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'Null for human_manual and imported rows, which never had an AI draft.',
  })
  originalContent!: string | null;

  @ApiProperty({ example: ResponseSource.IMPORTED, enum: ResponseSource })
  source!: ResponseSource;

  @ApiProperty({
    example: ClientResponseStatus.APPROVED,
    enum: ClientResponseStatus,
    description:
      'A projection onto the four values the client understands, not the raw seven-value ' +
      'response_status — see the module swagger for the mapping and why.',
  })
  status!: ClientResponseStatus;

  @ApiPropertyOptional({ example: null, nullable: true })
  createdByUserId!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  approvedByUserId!: string | null;

  @ApiProperty({ example: '2026-03-12T09:01:11.402Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  decidedAt!: string | null;

  @ApiPropertyOptional({ example: '2026-03-12T09:01:11.402Z', nullable: true })
  postedAt!: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  errorMessage!: string | null;
}

export class ReviewDetailResponseDto extends ReviewListItemDto {
  @ApiProperty({ example: 'ptl-001' })
  externalReviewId!: string;

  @ApiPropertyOptional({
    example: '2026-03-11T18:22:04.129Z',
    nullable: true,
    description:
      "Google's own last-modified timestamp. Load-bearing: the poller diffs it to detect an " +
      'upstream edit and supersede pending drafts.',
  })
  externalUpdatedAt!: string | null;

  @ApiProperty({ type: [ReviewResponseItemDto] })
  responses!: ReviewResponseItemDto[];
}
