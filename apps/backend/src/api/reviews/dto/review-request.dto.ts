import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

import { REVIEWS_PAGE_SIZE_DEFAULT, REVIEWS_PAGE_SIZE_MAX } from '../constants/reviews.constants';

export class ListReviewsQueryDto {
  @ApiPropertyOptional({ example: ReviewStatus.IN_REVIEW, enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus, {
    message: `status must be one of: ${Object.values(ReviewStatus).join(', ')}`,
  })
  status?: ReviewStatus;

  @ApiPropertyOptional({
    example: ReviewClassification.ESCALATED,
    enum: ReviewClassification,
    description:
      'The frontend\'s "unclassified" is NOT a valid value here — it has no column behind it.',
  })
  @IsOptional()
  @IsEnum(ReviewClassification, {
    message: `classification must be one of: ${Object.values(ReviewClassification).join(', ')}`,
  })
  classification?: ReviewClassification;

  @ApiPropertyOptional({
    example: '0190f3a9-1d22-7b4c-8e11-9c2f4a7b6d03',
    description: 'A location from another tenant yields an empty page, not a 403.',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({
    example: 'Nadia',
    minLength: 1,
    maxLength: 255,
    description:
      'Case-insensitive substring match on reviewer_name only — matching the frontend, which ' +
      'searches reviewer name, not review text. An anonymized row has a NULL name and can never ' +
      'match, which is the intended privacy outcome.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 255)
  search?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: REVIEWS_PAGE_SIZE_DEFAULT,
    minimum: 1,
    maximum: REVIEWS_PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVIEWS_PAGE_SIZE_MAX)
  pageSize?: number;
}
