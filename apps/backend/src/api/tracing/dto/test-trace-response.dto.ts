import { ApiProperty } from '@nestjs/swagger';

import { WorkSimulationResultDto } from './work-simulation-result.dto';

export class TestTraceResponseDto {
  @ApiProperty({ description: 'Whether the test trace was generated successfully', example: true })
  success!: boolean;

  @ApiProperty({
    description: 'Human-readable result message',
    example: 'Test trace generated successfully',
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

  @ApiProperty({ description: 'Result of the simulated work', type: () => WorkSimulationResultDto })
  result!: WorkSimulationResultDto;
}
