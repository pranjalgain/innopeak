import { ApiProperty } from '@nestjs/swagger';

/** Shared page/pageSize/total/totalPages envelope for every paginated list response — see
 *  `ConnectionsSyncService.listSyncRuns` for the first place this shape was established. */
export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  total!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}
