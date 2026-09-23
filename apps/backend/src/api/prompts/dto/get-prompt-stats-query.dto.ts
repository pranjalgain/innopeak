import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GetPromptStatsQueryDto {
  @ApiPropertyOptional({
    description:
      'Scopes the aggregate to one prompt version. Omit to aggregate across every version of ' +
      'the prompt.',
    example: 3,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
