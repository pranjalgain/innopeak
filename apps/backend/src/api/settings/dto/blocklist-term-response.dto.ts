import { ApiProperty } from '@nestjs/swagger';

import type { BlocklistTermRecord } from '../types/settings.type';

export class BlocklistTermDto {
  @ApiProperty({ example: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8' })
  id!: string;

  @ApiProperty({ example: 'food poisoning' })
  term!: string;

  @ApiProperty({ example: '2026-08-11T10:04:19Z' })
  createdAt!: string;

  static from(row: BlocklistTermRecord): BlocklistTermDto {
    const dto = new BlocklistTermDto();
    dto.id = row.id;
    dto.term = row.term;
    dto.createdAt = row.createdAt;
    return dto;
  }
}

export class BlocklistTermListResponseDto {
  @ApiProperty({ type: [BlocklistTermDto] })
  items!: BlocklistTermDto[];

  @ApiProperty({ example: 4 })
  total!: number;

  static from(rows: BlocklistTermRecord[]): BlocklistTermListResponseDto {
    const dto = new BlocklistTermListResponseDto();
    dto.items = rows.map(row => BlocklistTermDto.from(row));
    dto.total = rows.length;
    return dto;
  }
}

export class DeleteBlocklistTermResponseDto {
  @ApiProperty({ example: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2da' })
  id!: string;

  @ApiProperty({ example: 'Blocklist term removed' })
  message!: string;

  static from(id: string, message: string): DeleteBlocklistTermResponseDto {
    const dto = new DeleteBlocklistTermResponseDto();
    dto.id = id;
    dto.message = message;
    return dto;
  }
}
