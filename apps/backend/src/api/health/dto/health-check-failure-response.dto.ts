import { ApiProperty } from '@nestjs/swagger';

import { HealthCheckResponseDto } from './health-check-response.dto';

export class HealthCheckFailureResponseDto {
  @ApiProperty({ enum: [503], example: 503 })
  statusCode!: 503;

  @ApiProperty({ enum: ['Failure'], example: 'Failure' })
  status!: 'Failure';

  @ApiProperty({ description: 'Human-readable result message', example: 'Health check failed' })
  message!: string;

  @ApiProperty({ description: 'Error message describing the failure' })
  error!: string;

  @ApiProperty({
    description: 'Per-component results, so the caller can see which dependency is down',
    type: () => HealthCheckResponseDto,
    nullable: true,
  })
  data!: HealthCheckResponseDto | null;
}
