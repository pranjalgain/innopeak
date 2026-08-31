import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ChatRequestDto {
  @ApiProperty({
    description: 'The user message to send to the agent',
    example: 'What documents do we have about onboarding?',
  })
  @IsString()
  @IsNotEmpty({ message: 'Message is required' })
  @MaxLength(10_000, { message: 'Message must not exceed 10000 characters' })
  message!: string;

  @ApiPropertyOptional({
    description: 'Existing conversation ID to continue (null for new conversation)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4', { message: 'conversationId must be a valid UUID' })
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'AI model to use (default: gpt-4o)',
    example: 'gpt-4o',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Custom system prompt for the agent',
    example: 'You are a helpful coding assistant.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5_000, { message: 'System prompt must not exceed 5000 characters' })
  systemPrompt?: string;

  @ApiPropertyOptional({
    description: 'Temperature for response generation (0.0 to 2.0)',
    example: 0.7,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of agent turns (tool call iterations)',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  maxTurns?: number;
}
