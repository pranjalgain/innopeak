import type { EnvConfig } from '@config/env.config';
import { ConfigService } from '@nestjs/config';

const configService = new ConfigService<EnvConfig>();

export interface PaginationParams {
  pageNo?: number;
  pageSize?: number;
}

export interface PaginationDetails {
  pageNo: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// Parse default values as integers
const DEFAULT_PAGE = parseInt(configService.get<string>('DEFAULT_PAGE') ?? '1', 10);
const DEFAULT_PAGE_SIZE = parseInt(configService.get<string>('DEFAULT_PAGE_SIZE') ?? '10', 10);

export function calculateSkipAndTake(params: PaginationParams): { skip: number; take: number } {
  const pageNo = params.pageNo ?? DEFAULT_PAGE;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const skip = (pageNo - 1) * pageSize;
  const take = pageSize;

  return { skip, take };
}

export function getPaginationDetails(
  totalCount: number,
  params: PaginationParams
): PaginationDetails {
  const pageNo = params.pageNo ?? DEFAULT_PAGE;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    pageNo,
    pageSize,
    totalCount,
    totalPages,
  };
}
