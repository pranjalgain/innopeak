import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PROMPT_TONES } from '../constants/prompts.constants';
import type {
  PromptCategory,
  PromptCreatedBy,
  PromptRecord,
  PromptTone,
  PromptVersionRecord,
} from '../types/prompt.type';

export class PromptCreatedByDto {
  @ApiProperty({ example: '0190f3b2-1c44-7a10-8f31-2b7c9e5d0002' })
  userId!: string;

  @ApiProperty({ example: 'Jane Doe', nullable: true, type: String })
  name!: string | null;

  static from(createdBy: PromptCreatedBy): PromptCreatedByDto {
    const dto = new PromptCreatedByDto();
    dto.userId = createdBy.userId;
    dto.name = createdBy.name;
    return dto;
  }
}

export class PromptVersionDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0aa1' })
  id!: string;

  @ApiProperty({ example: 3 })
  version!: number;

  @ApiProperty({ example: 'You are replying on behalf of {{business_name}}...' })
  template!: string;

  @ApiProperty({ example: '2026-08-25T09:30:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ type: PromptCreatedByDto, nullable: true })
  createdBy!: PromptCreatedByDto | null;

  static from(record: PromptVersionRecord): PromptVersionDto {
    const dto = new PromptVersionDto();
    dto.id = record.id;
    dto.version = record.version;
    dto.template = record.template;
    dto.createdAt = record.createdAt.toISOString();
    dto.createdBy =
      record.createdByUserId === null
        ? null
        : PromptCreatedByDto.from({
            userId: record.createdByUserId,
            name: record.createdByName,
          });
    return dto;
  }
}

export class PromptCurrentVersionDto extends PromptVersionDto {}

export class PromptDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011' })
  id!: string;

  @ApiProperty({ example: 'positive', enum: ['positive', 'neutral', 'escalated'] })
  category!: PromptCategory;

  @ApiProperty({ example: 'Positive review reply' })
  name!: string;

  @ApiProperty({ example: 'Used for 4-5 star reviews.' })
  description!: string;

  @ApiProperty({ type: PromptCurrentVersionDto })
  currentVersion!: PromptCurrentVersionDto;

  @ApiProperty({
    example: 'professional',
    enum: PROMPT_TONES,
    description: 'Live tenant-level tone on prompts.tone — not versioned.',
  })
  tone!: PromptTone;

  @ApiProperty({ example: 3 })
  versionCount!: number;

  @ApiProperty({ example: '2026-08-20T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-20T10:00:00.000Z' })
  updatedAt!: string;

  @ApiPropertyOptional({ type: [PromptVersionDto] })
  versions?: PromptVersionDto[];
}

export class PromptListResponseDto {
  @ApiProperty({ type: [PromptDto] })
  prompts!: PromptDto[];

  static from(prompts: PromptDto[]): PromptListResponseDto {
    const dto = new PromptListResponseDto();
    dto.prompts = prompts;
    return dto;
  }
}

export class CreatePromptVersionResponseDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011' })
  promptId!: string;

  @ApiProperty({ type: PromptVersionDto })
  version!: PromptVersionDto;

  @ApiProperty({ example: 4 })
  versionCount!: number;

  static from(
    promptId: string,
    version: PromptVersionDto,
    versionCount: number
  ): CreatePromptVersionResponseDto {
    const dto = new CreatePromptVersionResponseDto();
    dto.promptId = promptId;
    dto.version = version;
    dto.versionCount = versionCount;
    return dto;
  }
}

export interface PromptVersionStatsInput {
  totalGenerated: number;
  approvedCount: number;
  approvedAsIsCount: number;
  approvedEditedCount: number;
  rejectedCount: number;
  pendingCount: number;
  supersededCount: number;
  averageDecisionMinutes: number | null;
}

export class PromptVersionStatsResponseDto {
  @ApiProperty({ example: 42 })
  totalGenerated!: number;

  @ApiProperty({ example: 30 })
  approvedCount!: number;

  @ApiProperty({ example: 21 })
  approvedAsIsCount!: number;

  @ApiProperty({ example: 9 })
  approvedEditedCount!: number;

  @ApiProperty({ example: 4 })
  rejectedCount!: number;

  @ApiProperty({ example: 6 })
  pendingCount!: number;

  @ApiProperty({ example: 2 })
  supersededCount!: number;

  @ApiProperty({ example: 12.5, nullable: true, type: Number })
  averageDecisionMinutes!: number | null;

  static from(input: PromptVersionStatsInput): PromptVersionStatsResponseDto {
    const dto = new PromptVersionStatsResponseDto();
    dto.totalGenerated = input.totalGenerated;
    dto.approvedCount = input.approvedCount;
    dto.approvedAsIsCount = input.approvedAsIsCount;
    dto.approvedEditedCount = input.approvedEditedCount;
    dto.rejectedCount = input.rejectedCount;
    dto.pendingCount = input.pendingCount;
    dto.supersededCount = input.supersededCount;
    dto.averageDecisionMinutes = input.averageDecisionMinutes;
    return dto;
  }
}

export interface PromptStatsBatchItemInput {
  promptId: string;
  version: number;
  stats: PromptVersionStatsInput;
}

export class PromptStatsBatchItemDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011' })
  promptId!: string;

  @ApiProperty({ example: 3 })
  version!: number;

  @ApiProperty({ type: PromptVersionStatsResponseDto })
  stats!: PromptVersionStatsResponseDto;

  static from(input: PromptStatsBatchItemInput): PromptStatsBatchItemDto {
    const dto = new PromptStatsBatchItemDto();
    dto.promptId = input.promptId;
    dto.version = input.version;
    dto.stats = PromptVersionStatsResponseDto.from(input.stats);
    return dto;
  }
}

export class PromptStatsBatchResponseDto {
  @ApiProperty({ type: [PromptStatsBatchItemDto] })
  results!: PromptStatsBatchItemDto[];

  static from(items: PromptStatsBatchItemInput[]): PromptStatsBatchResponseDto {
    const dto = new PromptStatsBatchResponseDto();
    dto.results = items.map(item => PromptStatsBatchItemDto.from(item));
    return dto;
  }
}

export class UpdatePromptToneResponseDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011' })
  promptId!: string;

  @ApiProperty({ example: 'friendly', enum: PROMPT_TONES })
  tone!: PromptTone;

  static from(prompt: PromptRecord): UpdatePromptToneResponseDto {
    const dto = new UpdatePromptToneResponseDto();
    dto.promptId = prompt.id;
    dto.tone = prompt.tone;
    return dto;
  }
}
