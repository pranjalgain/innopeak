import { parseBooleanInput } from '@common/helpers/boolean.utils';
import { parseIntegerInput } from '@common/helpers/number.utils';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

import { POSTGRES_INTEGER_MAX } from '../constants/settings.constants';

export class UpdateTenantSettingsDto {
  @ApiProperty({
    example: 3,
    minimum: 1,
    maximum: 5,
    description:
      'Reviews with rating strictly below this value escalate (low_rating). Not retroactive.',
  })
  @Transform(parseIntegerInput)
  @IsInt()
  @Min(1)
  @Max(5)
  escalationRatingThreshold!: number;

  @ApiProperty({
    example: false,
    description:
      'When true, an approved reply is posted without a second manual step. Approval is still required.',
  })
  @Transform(parseBooleanInput)
  @IsBoolean()
  autoPostEnabled!: boolean;

  @ApiPropertyOptional({
    example: 24,
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: POSTGRES_INTEGER_MAX,
    description:
      'Months of reviewer PII retention. null or omitted stores NULL, which opts this tenant out ' +
      'of the nightly reviewer-retention purge entirely — there is no platform-default fallback. ' +
      'No product-level upper bound — a very large value is functionally "keep indefinitely" and ' +
      "is the tenant's call — but the column is a Postgres INTEGER, so a value past its own range " +
      'reached the database as an uncaught 22003 and surfaced as a 500 rather than a 400.',
  })
  @IsOptional()
  @ValidateIf((_value: unknown, value: unknown) => value !== null)
  @Transform(parseIntegerInput)
  @IsInt()
  @Min(1)
  @Max(POSTGRES_INTEGER_MAX)
  reviewDataRetentionMonths?: number | null;

  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: 3,
    description: 'How many AI-drafted reply variants to generate per review — Settings’ AI tab.',
  })
  @Transform(parseIntegerInput)
  @IsInt()
  @Min(1)
  @Max(3)
  aiReplyCount!: number;
}
