import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { HealthCheckResultsDto } from './health-check-results.dto';

export class HealthCheckResponseDto {
  @ApiProperty({ description: 'Overall health status', enum: ['up', 'down'], example: 'up' })
  status!: 'down' | 'up';

  @ApiProperty({ description: 'Health check results (summary)', type: () => HealthCheckResultsDto })
  info!: HealthCheckResultsDto;

  @ApiPropertyOptional({ description: 'Summary error message when one or more checks failed' })
  error?: string | undefined;

  @ApiProperty({
    description: 'Health check results (detailed)',
    type: () => HealthCheckResultsDto,
  })
  details!: HealthCheckResultsDto;
}
