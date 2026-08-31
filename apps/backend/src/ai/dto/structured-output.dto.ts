import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { ChatMessageDto } from './chat-completion.dto';

export class StructuredOutputDto {
  @ApiProperty({
    description: 'Array of messages forming the conversation',
    type: [ChatMessageDto],
  })
  @IsArray({ message: 'Messages must be an array' })
  @ArrayMinSize(1, { message: 'At least one message is required' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiProperty({
    description: 'JSON Schema describing the expected structured output',
    example: {
      type: 'object',
      properties: {
        sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
        confidence: { type: 'number' },
      },
      required: ['sentiment', 'confidence'],
    },
  })
  @IsObject({ message: 'Schema must be a valid JSON object' })
  @IsNotEmpty({ message: 'Schema is required' })
  schema!: Record<string, unknown>;

  @ApiProperty({
    description: 'Human-readable name for the schema',
    example: 'SentimentAnalysis',
  })
  @IsString()
  @IsNotEmpty({ message: 'Schema name is required' })
  schemaName!: string;

  @ApiPropertyOptional({
    description: 'Model identifier to use',
    example: 'gpt-4o',
  })
  @IsOptional()
  @IsString({ message: 'Model must be a string' })
  model?: string;

  @ApiPropertyOptional({
    description: 'AI provider to use',
    enum: ['claude', 'openai'],
    example: 'openai',
  })
  @IsOptional()
  @IsString()
  @IsIn(['claude', 'openai'], {
    message: 'Provider must be one of: claude, openai',
  })
  provider?: string;
}
