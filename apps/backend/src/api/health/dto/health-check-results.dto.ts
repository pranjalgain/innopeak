import { ApiProperty } from '@nestjs/swagger';

import { HealthEntryDto } from './health-entry.dto';

export class HealthCheckResultsDto {
  @ApiProperty({ description: 'Outbound HTTP connectivity check', type: () => HealthEntryDto })
  google!: HealthEntryDto;

  @ApiProperty({ description: 'Database connectivity check', type: () => HealthEntryDto })
  database!: HealthEntryDto;

  @ApiProperty({ description: 'Redis connectivity check', type: () => HealthEntryDto })
  redis!: HealthEntryDto;

  @ApiProperty({ description: 'Process heap memory check', type: () => HealthEntryDto })
  memory_heap!: HealthEntryDto;
}
