import { type DrizzleTransaction } from '@db/db.service';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { Injectable } from '@nestjs/common';

import { PromptsRepository } from './prompts.repository';

import {
  DEFAULT_PROMPT_TONE,
  DEFAULT_PROMPTS,
} from '../../../api/prompts/constants/default-prompts.constant';
import { PROMPT_VERSION_APPEND_RETRY_LIMIT } from '../../../api/prompts/constants/prompts.constants';
import type {
  AppendedPromptVersion,
  AppendPromptVersionInput,
  CurrentPromptForCategory,
  PromptCategory,
  PromptRecord,
  PromptVersionRecord,
  PromptWithVersions,
  UpdatePromptToneInput,
} from '../../../api/prompts/types/prompt.type';

@Injectable()
export class PromptsDbService {
  constructor(private readonly promptsRepository: PromptsRepository) {}

  /**
   * Provisions a tenant's starting prompts and their v1 templates: decides what to seed
   * (`DEFAULT_PROMPTS`) and composes the two mechanical repository inserts it takes to land both
   * tables together, inside the caller's `tx` — a tenant that committed without prompts is exactly
   * the broken state this exists to prevent, and both tables have to land together or the listing
   * sees a prompt with no versions. `created_by_user_id` stays NULL: these are system-provisioned,
   * not authored by the owner.
   */
  async insertDefaultsForTenant(tx: DrizzleTransaction, tenantId: string): Promise<void> {
    const inserted = await this.promptsRepository.insertPrompts(
      tx,
      DEFAULT_PROMPTS.map(prompt => ({
        tenantId,
        category: prompt.category,
        name: prompt.name,
        description: prompt.description,
        tone: DEFAULT_PROMPT_TONE,
      }))
    );

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

    await this.promptsRepository.insertPromptVersions(tx, versions);
  }

  async listWithVersions(tenantId: string): Promise<PromptWithVersions[]> {
    const promptRows = await this.promptsRepository.findByTenant(tenantId);
    const versions = await this.promptsRepository.findVersionsByPromptIds(
      promptRows.map(prompt => prompt.id)
    );

    const versionsByPrompt = new Map<string, PromptVersionRecord[]>();
    for (const version of versions) {
      const list = versionsByPrompt.get(version.promptId) ?? [];
      list.push(version);
      versionsByPrompt.set(version.promptId, list);
    }

    return promptRows.map(prompt => ({
      prompt,
      versions: versionsByPrompt.get(prompt.id) ?? [],
    }));
  }

  /** Existence check scoped to the caller's tenant — used by `PromptsService.getVersionStats`
   *  when `version` is omitted, since there is no specific version to look up via `findVersion`
   *  in that case, only the prompt itself. */
  async findByIdForTenant(promptId: string, tenantId: string): Promise<PromptRecord | null> {
    return this.promptsRepository.findByIdForTenant(promptId, tenantId);
  }

  async getCurrentVersion(promptId: string, tenantId: string): Promise<PromptVersionRecord | null> {
    const prompt = await this.promptsRepository.findByIdForTenant(promptId, tenantId);
    if (prompt === null) {
      return null;
    }
    return this.promptsRepository.findCurrentVersion(promptId, tenantId);
  }

  /** What `AiReplyGenerationService` reads instead of `getCurrentVersion` — that one is keyed by
   *  a specific `prompts.id` (the Settings → Prompts editor already has it from a prior list
   *  call); generation only ever knows "which category", not an id. `null` means this tenant has
   *  no prompt for that category, which should never happen in practice (every tenant is seeded
   *  with all three at signup) but is a real possibility for a hand-edited/incomplete dev
   *  database, so the caller still has to handle it. */
  async findCurrentForCategory(
    tenantId: string,
    category: PromptCategory
  ): Promise<CurrentPromptForCategory | null> {
    const prompt = await this.promptsRepository.findByTenantAndCategory(tenantId, category);
    if (prompt === null) {
      return null;
    }

    const version = await this.promptsRepository.findCurrentVersion(prompt.id, tenantId);
    // Every prompt is seeded with a v1 in the same transaction it's created in
    // (`insertDefaultsForTenant`), so a versionless prompt is exactly as anomalous as a missing
    // one — treated the same way rather than throwing a different, more confusing error.
    if (version === null) {
      return null;
    }

    return { promptId: prompt.id, tone: prompt.tone, template: version.template };
  }

  async updateTone(input: UpdatePromptToneInput): Promise<PromptRecord | null> {
    return this.promptsRepository.updateTone(input);
  }

  async findVersion(
    promptId: string,
    version: number,
    tenantId: string
  ): Promise<PromptVersionRecord | null> {
    return this.promptsRepository.findVersion(promptId, version, tenantId);
  }

  async appendVersion(input: AppendPromptVersionInput): Promise<AppendedPromptVersion | null> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= PROMPT_VERSION_APPEND_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.promptsRepository.appendVersion(input);
      } catch (error: unknown) {
        if (!isUniqueViolation(error) || attempt === PROMPT_VERSION_APPEND_RETRY_LIMIT) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }

  async countVersions(promptId: string, tenantId: string): Promise<number> {
    return this.promptsRepository.countVersions(promptId, tenantId);
  }
}
