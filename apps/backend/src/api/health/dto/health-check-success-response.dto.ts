import { ApiProperty } from '@nestjs/swagger';

import { HealthCheckResponseDto } from './health-check-response.dto';

export class HealthCheckSuccessResponseDto {
  @ApiProperty({ enum: [200], example: 200 })
  statusCode!: 200;

  @ApiProperty({ enum: ['Success'], example: 'Success' })
  status!: 'Success';

  @ApiProperty({ description: 'Human-readable result message', example: 'Health check completed' })
  message!: string;

  @ApiProperty({ description: 'Health check results', type: () => HealthCheckResponseDto })
  data!: HealthCheckResponseDto;
}
