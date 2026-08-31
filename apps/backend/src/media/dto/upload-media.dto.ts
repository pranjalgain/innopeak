import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class UploadMediaDto {
  @ApiPropertyOptional({
    description: 'Optional JSON metadata to associate with the uploaded file',
    example: { tags: ['avatar', 'profile'], description: 'User profile picture' },
    type: Object,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
