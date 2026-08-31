import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Mirrors `@nestjs/terminus`'s `HealthIndicatorResult[string]` shape (`{ status } & Record<string, any>`).
 * Individual indicators attach ad-hoc fields (`message`, `error`, `url`, ...), and some
 * (see `custom-http-health.indicator.ts`, `custom-database-health.indicator.ts`) pass their own
 * `status` inside that extra data, which overwrites the up/down status — so `status` is typed
 * loosely here to reflect what indicators can actually produce, not just `'up' | 'down'`.
 */
export class HealthEntryDto {
  @ApiPropertyOptional({ description: 'Indicator status', example: 'up' })
  status?: number | string;

  @ApiPropertyOptional({ description: 'Human-readable status message' })
  message?: string;

  @ApiPropertyOptional({ description: 'Error message when the check fails' })
  error?: string;

  @ApiPropertyOptional({ description: 'Target URL for HTTP-based checks' })
  url?: string;
}
