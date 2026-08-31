import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({
    description: 'Role of the message author',
    enum: ['user', 'assistant', 'system', 'tool'],
    example: 'user',
  })
  @IsString()
  @IsNotEmpty({ message: 'Role is required' })
  @IsIn(['user', 'assistant', 'system', 'tool'], {
    message: 'Role must be one of: user, assistant, system, tool',
  })
  role!: 'assistant' | 'system' | 'tool' | 'user';

  @ApiProperty({
    description: 'Content of the message',
    example: 'Explain how dependency injection works in NestJS.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Content is required' })
  content!: string;
}

export class ToolDefinitionDto {
  @ApiProperty({
    description: 'Name of the tool',
    example: 'get_weather',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tool name is required' })
  name!: string;

  @ApiProperty({
    description: 'Description of what the tool does',
    example: 'Gets the current weather for a given location',
  })
  @IsString()
  @IsNotEmpty({ message: 'Tool description is required' })
  description!: string;

  @ApiProperty({
    description: 'JSON Schema for the tool parameters',
    example: { type: 'object', properties: { location: { type: 'string' } } },
  })
  @IsObject({ message: 'Parameters must be a valid JSON object' })
  parameters!: Record<string, unknown>;
}

export class ChatCompletionDto {
  @ApiProperty({
    description: 'Array of messages forming the conversation',
    type: [ChatMessageDto],
  })
  @IsArray({ message: 'Messages must be an array' })
  @ArrayMinSize(1, { message: 'At least one message is required' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @ApiPropertyOptional({
    description: 'Model identifier to use (e.g. "claude-sonnet-4-20250514", "gpt-4o")',
    example: 'claude-sonnet-4-20250514',
  })
  @IsOptional()
  @IsString({ message: 'Model must be a string' })
  model?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of tokens to generate',
    example: 4096,
    minimum: 1,
    maximum: 200000,
  })
  @IsOptional()
  @IsNumber({}, { message: 'maxTokens must be a number' })
  @Min(1, { message: 'maxTokens must be at least 1' })
  @Max(200000, { message: 'maxTokens must not exceed 200000' })
  maxTokens?: number;

  @ApiPropertyOptional({
    description: 'Sampling temperature (0 = deterministic, 2 = very random)',
    example: 0.7,
    minimum: 0,
    maximum: 2,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Temperature must be a number' })
  @Min(0, { message: 'Temperature must be at least 0' })
  @Max(2, { message: 'Temperature must not exceed 2' })
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Tool definitions available to the model',
    type: [ToolDefinitionDto],
  })
  @IsOptional()
  @IsArray({ message: 'Tools must be an array' })
  @ValidateNested({ each: true })
  @Type(() => ToolDefinitionDto)
  tools?: ToolDefinitionDto[];

  @ApiPropertyOptional({
    description: 'AI provider to use',
    enum: ['claude', 'openai'],
    example: 'claude',
  })
  @IsOptional()
  @IsString()
  @IsIn(['claude', 'openai'], {
    message: 'Provider must be one of: claude, openai',
  })
  provider?: string;
}
