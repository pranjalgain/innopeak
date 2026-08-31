import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CustomTraceRequestDto {
  @ApiProperty({ description: 'Name of the operation to trace', example: 'checkout' })
  @IsString()
  @MinLength(1)
  operation!: string;

  @ApiPropertyOptional({
    description: 'Target duration for the simulated work, in milliseconds',
    example: 1000,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  duration?: number;
}
