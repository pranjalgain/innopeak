import { ApiProperty } from '@nestjs/swagger';

export class TracingStatusResponseDto {
  @ApiProperty({ description: 'Whether the OpenTelemetry SDK is currently active', example: true })
  active!: boolean;

  @ApiProperty({ description: 'Name of the traced service', example: 'nestjs-app' })
  service!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp of the status check' })
  timestamp!: string;
}
