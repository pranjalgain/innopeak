import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import {
  BlocklistTermDto,
  BlocklistTermListResponseDto,
  DeleteBlocklistTermResponseDto,
} from '../dto/blocklist-term-response.dto';
import { CreateBlocklistTermDto } from '../dto/create-blocklist-term.dto';

export function ApiListBlocklistTerms(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List blocklist terms',
      description:
        'Owner-only. Returns every term this tenant has, ordered case-insensitively. ' +
        'Not retroactive — adding a term does not reclassify existing reviews.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: BlocklistTermListResponseDto,
      examples: {
        default: {
          summary: 'Typical response',
          value: {
            items: [
              {
                id: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8',
                term: 'food poisoning',
                createdAt: '2026-08-11T10:04:19Z',
              },
            ],
            total: 1,
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' })
  );
}

export function ApiCreateBlocklistTerm(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Add a blocklist term',
      description:
        'Inserts a term. The uniqueness check is case-insensitive — ' +
        '`idx_blocklist_terms_tenant_id_lower_term` is unique on `(tenant_id, lower(term))` — so ' +
        'a term the tenant already has is 409 regardless of casing. Removal is a hard delete, so ' +
        'a re-added term is a genuinely new row.',
    }),
    ApiBody({
      type: CreateBlocklistTermDto,
      examples: { default: { value: { term: 'food poisoning' } } },
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      type: BlocklistTermDto,
      examples: {
        default: {
          summary: 'Created',
          value: {
            id: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8',
            term: 'food poisoning',
            createdAt: '2026-08-11T10:04:19Z',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.CONFLICT, description: 'Term already exists' })
  );
}

export function ApiDeleteBlocklistTerm(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Remove a blocklist term',
      description: 'Hard delete. Cross-tenant ids return 404, not 403.',
    }),
    ApiParam({ name: 'id', type: String, format: 'uuid' }),
    ApiResponse({
      status: HttpStatus.OK,
      type: DeleteBlocklistTermResponseDto,
      examples: {
        default: {
          summary: 'Deleted',
          value: {
            id: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2da',
            message: 'Blocklist term removed',
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Term not found for this tenant' })
  );
}
