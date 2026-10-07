import { DBService, type DrizzleTransaction } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type {
  AppendedPromptVersion,
  AppendPromptVersionInput,
  PromptCategory,
  PromptRecord,
  PromptTone,
  PromptVersionRecord,
  UpdatePromptToneInput,
} from '../../../api/prompts/types/prompt.type';

@Injectable()
export class PromptsRepository {
  constructor(private readonly dbService: DBService) {}

  /** `ON CONFLICT DO NOTHING` on `idx_prompts_tenant_id_category` makes provisioning re-runnable (no 23505); only newly created rows come back. */
  async insertPrompts(
    tx: DrizzleTransaction,
    rows: Array<{
      tenantId: string;
      category: PromptCategory;
      name: string;
      description: string;
      tone: PromptTone;
    }>
  ): Promise<Array<{ id: string; category: PromptCategory }>> {
    return (
      tx
        .insert(schema.prompts)
        .values(rows)
        // Targeted arbiter, not bare: any other unique violation stays an error.
        .onConflictDoNothing({ target: [schema.prompts.tenantId, schema.prompts.category] })
        .returning({ id: schema.prompts.id, category: schema.prompts.category })
    );
  }

  async insertPromptVersions(
    tx: DrizzleTransaction,
    rows: Array<{ promptId: string; version: number; template: string; createdByUserId: null }>
  ): Promise<void> {
    if (rows.length > 0) {
      await tx.insert(schema.promptVersions).values(rows);
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

  /** At most one prompt per (tenant, category) via `idx_prompts_tenant_id_category`; generation looks up by category, not `prompts.id`. */
  async findByTenantAndCategory(
    tenantId: string,
    category: PromptCategory
  ): Promise<PromptRecord | null> {
    const rows = await this.dbService.db
      .select()
      .from(schema.prompts)
      .where(and(eq(schema.prompts.tenantId, tenantId), eq(schema.prompts.category, category)))
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

  /** Joined to `prompts` and tenant-scoped: `prompt_versions` has no `tenant_id`, so isolation must not rest on caller discipline. */
  async findCurrentVersion(
    promptId: string,
    tenantId: string
  ): Promise<PromptVersionRecord | null> {
    const rows = await this.dbService.db
      .select({ version: schema.promptVersions, createdByName: schema.users.name })
      .from(schema.promptVersions)
      .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptVersions.promptId))
      .leftJoin(schema.users, eq(schema.users.id, schema.promptVersions.createdByUserId))
      .where(
        and(eq(schema.promptVersions.promptId, promptId), eq(schema.prompts.tenantId, tenantId))
      )
      .orderBy(sql`${schema.promptVersions.version} DESC`)
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : this.mapVersion(row.version, row.createdByName);
  }

  /** Same tenant scoping as `findCurrentVersion`, for one specific version number. */
  async findVersion(
    promptId: string,
    version: number,
    tenantId: string
  ): Promise<PromptVersionRecord | null> {
    const rows = await this.dbService.db
      .select({ version: schema.promptVersions, createdByName: schema.users.name })
      .from(schema.promptVersions)
      .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptVersions.promptId))
      .leftJoin(schema.users, eq(schema.users.id, schema.promptVersions.createdByUserId))
      .where(
        and(
          eq(schema.promptVersions.promptId, promptId),
          eq(schema.promptVersions.version, version),
          eq(schema.prompts.tenantId, tenantId)
        )
      )
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : this.mapVersion(row.version, row.createdByName);
  }

  /** Same tenant-scoping rationale as `findCurrentVersion`. */
  async countVersions(promptId: string, tenantId: string): Promise<number> {
    const rows = await this.dbService.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.promptVersions)
      .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptVersions.promptId))
      .where(
        and(eq(schema.promptVersions.promptId, promptId), eq(schema.prompts.tenantId, tenantId))
      );

    return rows[0]?.count ?? 0;
  }

  async updateTone(input: UpdatePromptToneInput): Promise<PromptRecord | null> {
    const { promptId, tenantId, tone } = input;
    const rows = await this.dbService.db
      .update(schema.prompts)
      .set({ tone, updatedAt: sql`now()` })
      .where(and(eq(schema.prompts.id, promptId), eq(schema.prompts.tenantId, tenantId)))
      .returning();

    const row = rows[0];
    return row === undefined ? null : this.mapPrompt(row);
  }

  async appendVersion(input: AppendPromptVersionInput): Promise<AppendedPromptVersion | null> {
    const { promptId, tenantId, template, createdByUserId } = input;
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
