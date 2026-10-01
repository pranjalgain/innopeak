import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListAdminUsersQueryDto {
  @ApiPropertyOptional({
    example: 'jane',
    maxLength: 200,
    description: 'Case-insensitive substring match against the user name or their business name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
