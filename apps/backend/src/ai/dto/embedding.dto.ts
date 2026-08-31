import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EmbeddingDto {
  @ApiProperty({
    description: 'Input text (or array of texts) to embed',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'The quick brown fox jumps over the lazy dog.',
  })
  @IsNotEmpty({ message: 'Input is required' })
  input!: string[] | string;

  @ApiPropertyOptional({
    description: 'Embedding model identifier',
    example: 'text-embedding-3-small',
  })
  @IsOptional()
  @IsString({ message: 'Model must be a string' })
  model?: string;

  @ApiPropertyOptional({
    description: 'AI provider to use (defaults to openai for embeddings)',
    enum: ['openai'],
    example: 'openai',
  })
  @IsOptional()
  @IsString()
  @IsIn(['openai'], {
    message: 'Only openai is supported for embeddings',
  })
  provider?: string;
}
