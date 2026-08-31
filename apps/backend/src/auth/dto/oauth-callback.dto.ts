import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class OAuthCallbackDto {
  @ApiProperty({
    description: 'Authorization code returned by the OAuth provider',
    example: '4/0AY0e-g7...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Authorization code is required' })
  code!: string;

  @ApiPropertyOptional({
    description: 'State parameter for CSRF protection',
    example: 'random-csrf-state-token',
  })
  @IsString()
  @IsOptional()
  state?: string;
}
