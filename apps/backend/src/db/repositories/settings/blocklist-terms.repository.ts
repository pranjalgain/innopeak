import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { InsertedBlocklistTermRow } from './types/settings.type';

import type {
  BlocklistTermRecord,
  CreateBlocklistTermInput,
  DeleteBlocklistTermInput,
  InsertBlocklistTermResult,
} from '../../../api/settings/types/settings.type';

@Injectable()
export class BlocklistTermsRepository {
  constructor(private readonly dbService: DBService) {}

  async listByTenant(tenantId: string): Promise<BlocklistTermRecord[]> {
    const rows = await this.dbService.db
      .select({
        id: schema.blocklistTerms.id,
        term: schema.blocklistTerms.term,
        createdAt: schema.blocklistTerms.createdAt,
      })
      .from(schema.blocklistTerms)
      .where(eq(schema.blocklistTerms.tenantId, tenantId))
      .orderBy(sql`lower(${schema.blocklistTerms.term})`);

    return rows.map(row => ({ id: row.id, term: row.term, createdAt: row.createdAt }));
  }

  /**
   * `duplicate` if the tenant already has the term (case-insensitive unique index, so DO NOTHING yields no row); checked before `limit_reached`.
   * Count and insert share one transaction behind a per-tenant advisory lock, or concurrent requests would each see room for one more.
   * Removal is a hard DELETE: `reviews.matched_keywords` stores terms as text with no FK, so it never orphans an escalation.
   */
  async insertTerm(input: CreateBlocklistTermInput): Promise<InsertBlocklistTermResult> {
    const { tenantId, term, maxTerms } = input;

    return this.dbService.db.transaction(async tx => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`blocklist_terms:${tenantId}`}, 0))`
      );

      const counted = await tx.execute(
        sql`SELECT count(*)::int AS n FROM blocklist_terms WHERE tenant_id = ${tenantId}::uuid`
      );
      const existing = (counted.rows[0] as { n: number } | undefined)?.n ?? 0;

      if (existing >= maxTerms) {
        const already = await tx.execute(sql`
          SELECT 1 FROM blocklist_terms
          WHERE tenant_id = ${tenantId}::uuid AND lower(term::text) = lower(${term})
        `);
        return already.rows.length > 0
          ? { outcome: 'duplicate' as const }
          : { outcome: 'limit_reached' as const };
      }

      const result = await tx.execute(sql`
        INSERT INTO blocklist_terms (tenant_id, term)
        VALUES (${tenantId}::uuid, ${term})
        ON CONFLICT (tenant_id, lower((term)::text)) DO NOTHING
        RETURNING id, term, created_at
      `);

      const row = result.rows[0] as InsertedBlocklistTermRow | undefined;
      if (row === undefined) {
        return { outcome: 'duplicate' as const };
      }

      return {
        outcome: 'created' as const,
        record: {
          id: row.id,
          term: row.term,
          createdAt:
            row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        },
      };
    });
  }

  async deleteForTenant(input: DeleteBlocklistTermInput): Promise<boolean> {
    const { id, tenantId } = input;
    const rows = await this.dbService.db
      .delete(schema.blocklistTerms)
      .where(and(eq(schema.blocklistTerms.id, id), eq(schema.blocklistTerms.tenantId, tenantId)))
      .returning({ id: schema.blocklistTerms.id });

    return rows.length > 0;
  }
}
