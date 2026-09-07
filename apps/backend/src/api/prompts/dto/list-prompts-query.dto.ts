import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListPromptsQueryDto {
  @ApiPropertyOptional({
    description: 'When true, embed every version per prompt (oldest first)',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  includeHistory?: boolean;
}
