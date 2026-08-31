import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckFailureResponseDto {
  @ApiProperty({ enum: [503], example: 503 })
  statusCode!: 503;

  @ApiProperty({ enum: ['Failure'], example: 'Failure' })
  status!: 'Failure';

  @ApiProperty({ description: 'Human-readable result message', example: 'Health check failed' })
  message!: string;

  @ApiProperty({ description: 'Error message describing the failure' })
  error!: string;

  @ApiProperty({ enum: [null], example: null, nullable: true })
  data!: null;
}
