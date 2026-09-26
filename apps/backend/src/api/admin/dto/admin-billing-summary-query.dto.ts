import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const ADMIN_BILLING_TREND_MONTHS_DEFAULT = 6;
export const ADMIN_BILLING_TREND_MONTHS_MAX = 24;

export class AdminBillingSummaryQueryDto {
  @ApiPropertyOptional({
    example: ADMIN_BILLING_TREND_MONTHS_DEFAULT,
    default: ADMIN_BILLING_TREND_MONTHS_DEFAULT,
    minimum: 1,
    maximum: ADMIN_BILLING_TREND_MONTHS_MAX,
    description:
      'How many trailing calendar months the `upgradeTrend` series covers, counting back from ' +
      'the current one (inclusive). The other summary figures are all-time, not windowed by this.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_BILLING_TREND_MONTHS_MAX)
  months: number = ADMIN_BILLING_TREND_MONTHS_DEFAULT;
}
