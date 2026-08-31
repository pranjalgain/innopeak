import { ApiProperty } from '@nestjs/swagger';

import { TimedWorkSimulationResultDto } from './timed-work-simulation-result.dto';

export class CustomTraceResponseDto {
  @ApiProperty({
    description: 'Whether the custom trace was generated successfully',
    example: true,
  })
  success!: boolean;

  @ApiProperty({
    description: 'Human-readable result message',
    example: "Custom trace for operation 'checkout' generated successfully",
  })
  message!: string;

  @ApiProperty({
    description: 'OpenTelemetry trace ID for the generated span',
    example: '4bf92f3577b34da6a3ce929d0e0e4736',
  })
  traceId!: string;

  @ApiProperty({
    description: 'OpenTelemetry span ID for the generated span',
    example: '00f067aa0ba902b7',
  })
  spanId!: string;

  @ApiProperty({ description: 'Name of the operation that was traced', example: 'checkout' })
  operation!: string;

  @ApiProperty({
    description: 'Requested duration of the simulated work, in milliseconds',
    example: 1000,
  })
  duration!: number;

  @ApiProperty({
    description: 'Result of the simulated work',
    type: () => TimedWorkSimulationResultDto,
  })
  result!: TimedWorkSimulationResultDto;
}
