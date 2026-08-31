import { ApiProperty } from '@nestjs/swagger';

export class TimedWorkSimulationResultDto {
  @ApiProperty({
    description: 'Requested duration of the simulated work, in milliseconds',
    example: 1000,
  })
  targetDuration!: number;

  @ApiProperty({
    description: 'Actual duration the simulated work took, in milliseconds',
    example: 1003,
  })
  actualDuration!: number;

  @ApiProperty({ description: 'Number of simulated iterations performed', example: 15234 })
  iterations!: number;

  @ApiProperty({ description: 'Accumulated result of the simulated work', example: 7601.5 })
  result!: number;
}
