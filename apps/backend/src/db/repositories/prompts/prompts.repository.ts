import { DBService, type DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import {
  DEFAULT_PROMPT_TONE,
  DEFAULT_PROMPTS,
} from '../../../api/prompts/constants/default-prompts.constant';
import type { PromptToneValue } from '../../../api/prompts/constants/prompts.constants';
import type {
  AppendedPromptVersion,
  PromptRecord,
  PromptVersionRecord,
} from '../../../api/prompts/types/prompt.type';

@Injectable()
export class PromptsRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Provisions a tenant's starting prompts and their v1 templates. Takes the caller's `tx` so it
   * joins the signup transaction — a tenant that committed without prompts is exactly the broken
   * state this exists to prevent, and both tables have to land together or the listing sees a
   * prompt with no versions.
   *
   * `ON CONFLICT DO NOTHING` against `idx_prompts_tenant_id_category` makes it re-runnable, so a
   * retry or a later backfill over an already-provisioned tenant is a no-op rather than a 23505.
   * `created_by_user_id` stays NULL: these are system-provisioned, not authored by the owner.
   */
  async insertDefaultsForTenant(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    const inserted = await tx
      .insert(schema.prompts)
      .values(
        DEFAULT_PROMPTS.map(prompt => ({
          tenantId,
          category: prompt.category,
          name: prompt.name,
          description: prompt.description,
          tone: DEFAULT_PROMPT_TONE,
        }))
      )
      // Targeted rather than bare: this names `idx_prompts_tenant_id_category` as the arbiter, so
      // any *other* unique violation stays an error instead of being silently swallowed.
      .onConflictDoNothing({ target: [schema.prompts.tenantId, schema.prompts.category] })
      .returning({ id: schema.prompts.id, category: schema.prompts.category });

    // Only rows this statement actually created come back, so an already-provisioned category is
    // skipped here too and keeps the version history it has.
    const templates = new Map(DEFAULT_PROMPTS.map(prompt => [prompt.category, prompt.template]));
    const versions = inserted.flatMap(row => {
      const template = templates.get(row.category);
      // Unreachable — every returned category came from DEFAULT_PROMPTS. Skipped rather than
      // asserted past, because `noUncheckedIndexedAccess` types `Map.get` as possibly undefined
      // and inserting `undefined` into a NOT NULL column is the worse failure.
      return template === undefined
        ? []
        : [{ promptId: row.id, version: 1, template, createdByUserId: null }];
    });

    if (versions.length > 0) {
      await tx.insert(schema.promptVersions).values(versions);
    }
  }

  async findByTenant(tenantId: string): Promise<PromptRecord[]> {
    const rows = await this.dbService.db
      .select()
      .from(schema.prompts)
      .where(eq(schema.prompts.tenantId, tenantId))
      .orderBy(asc(schema.prompts.category));

    return rows.map(row => this.mapPrompt(row));
  }

  async findByIdForTenant(promptId: string, tenantId: string): Promise<PromptRecord | null> {
    const rows = await this.dbService.db
      .select()
      .from(schema.prompts)
      .where(and(eq(schema.prompts.id, promptId), eq(schema.prompts.tenantId, tenantId)))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : this.mapPrompt(row);
  }

  async findVersionsByPromptIds(promptIds: string[]): Promise<PromptVersionRecord[]> {
    if (promptIds.length === 0) {
      return [];
    }

    const rows = await this.dbService.db
      .select({ version: schema.promptVersions, createdByName: schema.users.name })
      .from(schema.promptVersions)
      .leftJoin(schema.users, eq(schema.users.id, schema.promptVersions.createdByUserId))
      .where(inArray(schema.promptVersions.promptId, promptIds))
      .orderBy(asc(schema.promptVersions.promptId), asc(schema.promptVersions.version));

    return rows.map(row => this.mapVersion(row.version, row.createdByName));
  }

  async findCurrentVersion(promptId: string): Promise<PromptVersionRecord | null> {
    const rows = await this.dbService.db
      .select({ version: schema.promptVersions, createdByName: schema.users.name })
      .from(schema.promptVersions)
      .leftJoin(schema.users, eq(schema.users.id, schema.promptVersions.createdByUserId))
      .where(eq(schema.promptVersions.promptId, promptId))
      .orderBy(sql`${schema.promptVersions.version} DESC`)
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : this.mapVersion(row.version, row.createdByName);
  }

  async countVersions(promptId: string): Promise<number> {
    const rows = await this.dbService.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.promptVersions)
      .where(eq(schema.promptVersions.promptId, promptId));

    return rows[0]?.count ?? 0;
  }

  async updateTone(
    promptId: string,
    tenantId: string,
    tone: PromptToneValue
  ): Promise<PromptRecord | null> {
    const rows = await this.dbService.db
      .update(schema.prompts)
      .set({ tone, updatedAt: sql`now()` })
      .where(and(eq(schema.prompts.id, promptId), eq(schema.prompts.tenantId, tenantId)))
      .returning();

    const row = rows[0];
    return row === undefined ? null : this.mapPrompt(row);
  }

  async appendVersion(
    promptId: string,
    tenantId: string,
    template: string,
    createdByUserId: string | null
  ): Promise<AppendedPromptVersion | null> {
    const createdBySql = createdByUserId === null ? sql`NULL` : sql`${createdByUserId}::uuid`;

    const result = await this.dbService.db.execute(sql`
      INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
      SELECT p.id,
             coalesce((SELECT max(v.version) FROM prompt_versions v WHERE v.prompt_id = p.id), 0) + 1,
             ${template},
             ${createdBySql}
      FROM prompts p
      WHERE p.id = ${promptId}::uuid
        AND p.tenant_id = ${tenantId}::uuid
      RETURNING id, version, template, created_at, created_by_user_id,
                (SELECT u.name FROM users u WHERE u.id = created_by_user_id) AS created_by_name
    `);

    const row = result.rows[0] as
      | {
          id: string;
          version: number;
          template: string;
          created_at: Date | string;
          created_by_user_id: string | null;
          created_by_name: string | null;
        }
      | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      id: row.id,
      version: Number(row.version),
      template: row.template,
      createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      createdByUserId: row.created_by_user_id,
      createdByName: row.created_by_name,
    };
  }

  private mapPrompt(row: typeof schema.prompts.$inferSelect): PromptRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      category: row.category,
      name: row.name,
      description: row.description ?? null,
      tone: row.tone,
      createdAt: this.asDate(row.createdAt),
      updatedAt: this.asDate(row.updatedAt),
    };
  }

  private mapVersion(
    row: typeof schema.promptVersions.$inferSelect,
    createdByName: string | null
  ): PromptVersionRecord {
    return {
      id: row.id,
      promptId: row.promptId,
      version: row.version,
      template: row.template,
      createdAt: this.asDate(row.createdAt),
      createdByUserId: row.createdByUserId ?? null,
      createdByName,
    };
  }

  private asDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
  }
}
