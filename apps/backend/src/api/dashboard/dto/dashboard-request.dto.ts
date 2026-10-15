import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const DASHBOARD_WINDOW_DAYS_DEFAULT = 7;
/**
 * The widest window the range selector offers (90d) plus room to grow. The cap exists because
 * `days` reaches `make_interval()`, which raises "integer out of range" on an unbounded value: a
 * 500 where a 400 belongs.
 */
export const DASHBOARD_WINDOW_DAYS_MAX = 365;

export const DASHBOARD_ESCALATED_LIMIT_DEFAULT = 3;
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

  @ApiPropertyOptional({
    example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
    description:
      'Scope to one location (`locations.id`). Omitted means every location the tenant has ' +
      "confirmed, aggregated — matching this endpoint's behavior before multi-location existed. " +
      "A location from another tenant yields zero rows, not a 403, same as the reviews list's own " +
      'locationId filter.',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
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

  @ApiPropertyOptional({
    example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
    description:
      'Scope to one location (`locations.id`). Omitted means every location, aggregated.',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
