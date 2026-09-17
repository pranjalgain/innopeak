import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type {
  BlocklistTermRecord,
  CreateBlocklistTermInput,
  DeleteBlocklistTermInput,
} from '../../../api/settings/types/blocklist-term.type';

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
   * Returns null when the tenant already has this term — `idx_blocklist_terms_tenant_id_lower_term`
   * is unique on `(tenant_id, lower(term))`, so the conflict is case-insensitive and DO NOTHING
   * yields no row. Removal is a hard DELETE with no history kept — `reviews.matched_keywords`
   * stores matched terms as text with no FK, so deleting one never orphans the escalation it
   * caused.
   */
  async insertTerm(input: CreateBlocklistTermInput): Promise<BlocklistTermRecord | null> {
    const { tenantId, term } = input;
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

  async deleteForTenant(input: DeleteBlocklistTermInput): Promise<boolean> {
    const { id, tenantId } = input;
    const rows = await this.dbService.db
      .delete(schema.blocklistTerms)
      .where(and(eq(schema.blocklistTerms.id, id), eq(schema.blocklistTerms.tenantId, tenantId)))
      .returning({ id: schema.blocklistTerms.id });

    return rows.length > 0;
  }
}
