import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class PaginationDetailsDto {
  @ApiProperty({ description: 'Current page number' })
  @IsNumber()
  pageNo!: number;

  @ApiProperty({ description: 'Number of items per page' })
  @IsNumber()
  pageSize!: number;

  @ApiProperty({ description: 'Total number of items available' })
  @IsNumber()
  totalCount!: number;

  @ApiProperty({ description: 'Total number of pages available' })
  @IsNumber()
  totalPages!: number;
}
