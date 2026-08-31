import { ApiProperty } from '@nestjs/swagger';

export class WorkSimulationResultDto {
  @ApiProperty({ description: 'Time taken to simulate the work, in milliseconds', example: 42 })
  duration!: number;

  @ApiProperty({ description: 'Number of simulated iterations performed', example: 1000000 })
  iterations!: number;

  @ApiProperty({ description: 'Accumulated result of the simulated work', example: 499876.12 })
  result!: number;
}
