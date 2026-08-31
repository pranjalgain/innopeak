import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdateWebhookDto {
  @ApiPropertyOptional({
    description: 'The URL to send webhook events to',
    example: 'https://example.com/webhooks/receive',
    maxLength: 2048,
  })
  @IsOptional()
  @IsUrl({}, { message: 'URL must be a valid URL' })
  @MaxLength(2048, { message: 'URL must not exceed 2048 characters' })
  url?: string;

  @ApiPropertyOptional({
    description: 'List of events to subscribe to',
    example: ['user.created', 'user.updated'],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'Events must be an array' })
  @ArrayMinSize(1, { message: 'At least one event is required' })
  @IsString({ each: true, message: 'Each event must be a string' })
  events?: string[];

  @ApiPropertyOptional({
    description: 'Whether the webhook is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'A human-readable description for this webhook',
    example: 'Notify external CRM on user events',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;
}
