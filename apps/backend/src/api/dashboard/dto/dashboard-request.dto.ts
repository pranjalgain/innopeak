import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DASHBOARD_WINDOW_DAYS_DEFAULT = 7;
/** A year of history is the widest window the dashboard's range selector offers (90d) plus room to
 * grow. The cap exists because `days` reaches `make_interval()`, which raises "integer out of
 * range" on an unbounded value — a 500 where a 400 belongs. */
export const DASHBOARD_WINDOW_DAYS_MAX = 365;

export const DASHBOARD_ESCALATED_LIMIT_DEFAULT = 4;
export const DASHBOARD_ESCALATED_LIMIT_MAX = 50;

export class DashboardWindowQueryDto {
  @ApiPropertyOptional({
    example: DASHBOARD_WINDOW_DAYS_DEFAULT,
    default: DASHBOARD_WINDOW_DAYS_DEFAULT,
    minimum: 1,
    maximum: DASHBOARD_WINDOW_DAYS_MAX,
    description: 'Size of the trailing window, counted from `reviewed_at`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_WINDOW_DAYS_MAX)
  days: number = DASHBOARD_WINDOW_DAYS_DEFAULT;
}

export class RecentEscalatedQueryDto {
  @ApiPropertyOptional({
    example: DASHBOARD_ESCALATED_LIMIT_DEFAULT,
    default: DASHBOARD_ESCALATED_LIMIT_DEFAULT,
    minimum: 1,
    maximum: DASHBOARD_ESCALATED_LIMIT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_ESCALATED_LIMIT_MAX)
  limit: number = DASHBOARD_ESCALATED_LIMIT_DEFAULT;
}
