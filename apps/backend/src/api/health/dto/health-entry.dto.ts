import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * `status` is typed loosely: some indicators pass their own `status` in the extra data, which
 * overwrites the up/down value.
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
