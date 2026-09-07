import { DBService } from '@db/db.service';
import { blocklistTerms } from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { BlocklistTermRecord } from '../../../api/settings/types/blocklist-term.type';

interface InsertedRow {
  id: string;
  term: string;
  created_at: Date | string;
}

@Injectable()
export class BlocklistTermsRepository {
  constructor(private readonly dbService: DBService) {}

  async listByTenant(tenantId: string): Promise<BlocklistTermRecord[]> {
    const rows = await this.dbService.db
      .select({
        id: blocklistTerms.id,
        term: blocklistTerms.term,
        createdAt: blocklistTerms.createdAt,
      })
      .from(blocklistTerms)
      .where(eq(blocklistTerms.tenantId, tenantId))
      .orderBy(sql`lower(${blocklistTerms.term})`);

    return rows.map(row => ({ id: row.id, term: row.term, createdAt: row.createdAt }));
  }

  /**
   * Returns null when the tenant already has this term — `idx_blocklist_terms_tenant_id_lower_term`
   * is unique on `(tenant_id, lower(term))`, so the conflict is case-insensitive and DO NOTHING
   * yields no row. Removal is a hard DELETE, so there is no inactive row to revive: the audit
   * trigger on this table already keeps the history a soft delete would have preserved, and
   * `reviews.matched_keywords` stores matched terms as text with no FK, so deleting one never
   * orphans the escalation it caused.
   */
  async insertTerm(tenantId: string, term: string): Promise<BlocklistTermRecord | null> {
    const result = await this.dbService.db.execute(sql`
      INSERT INTO blocklist_terms (tenant_id, term)
      VALUES (${tenantId}::uuid, ${term})
      ON CONFLICT (tenant_id, lower((term)::text)) DO NOTHING
      RETURNING id, term, created_at
    `);

    const row = result.rows[0] as InsertedRow | undefined;
    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      term: row.term,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    };
  }

  async deleteForTenant(id: string, tenantId: string): Promise<boolean> {
    const rows = await this.dbService.db
      .delete(blocklistTerms)
      .where(and(eq(blocklistTerms.id, id), eq(blocklistTerms.tenantId, tenantId)))
      .returning({ id: blocklistTerms.id });

    return rows.length > 0;
  }
}
