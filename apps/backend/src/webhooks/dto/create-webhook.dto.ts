import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({
    description: 'The URL to send webhook events to',
    example: 'https://example.com/webhooks/receive',
    maxLength: 2048,
  })
  @IsUrl({}, { message: 'URL must be a valid URL' })
  @IsNotEmpty({ message: 'URL is required' })
  @MaxLength(2048, { message: 'URL must not exceed 2048 characters' })
  url!: string;

  @ApiProperty({
    description: 'List of events to subscribe to',
    example: ['user.created', 'user.updated', 'order.completed'],
    type: [String],
  })
  @IsArray({ message: 'Events must be an array' })
  @ArrayMinSize(1, { message: 'At least one event is required' })
  @IsString({ each: true, message: 'Each event must be a string' })
  events!: string[];

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
