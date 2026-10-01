import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListAdminBusinessesQueryDto {
  @ApiPropertyOptional({
    example: 'coastal',
    maxLength: 200,
    description: 'Case-insensitive substring match against the tenant name or its owner name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
