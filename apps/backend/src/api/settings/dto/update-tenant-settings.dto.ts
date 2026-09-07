import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class UpdateTenantSettingsDto {
  @ApiProperty({
    example: 3,
    minimum: 1,
    maximum: 5,
    description:
      'Reviews with rating strictly below this value escalate (low_rating). Not retroactive.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  escalationRatingThreshold!: number;

  @ApiProperty({
    example: false,
    description:
      'When true, an approved reply is posted without a second manual step. Approval is still required.',
  })
  @IsBoolean()
  autoPostEnabled!: boolean;

  @ApiPropertyOptional({
    example: 24,
    nullable: true,
    minimum: 1,
    description:
      'Months of reviewer PII retention. null or omitted stores NULL (platform default).',
  })
  @IsOptional()
  @ValidateIf((_value: unknown, value: unknown) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reviewDataRetentionMonths?: number | null;
}
