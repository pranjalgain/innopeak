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

  /** Seeds `DEFAULT_PROMPTS` and their v1 templates in the caller's `tx`: both tables must land together or listing sees a prompt with no versions. `created_by_user_id` stays NULL (system-provisioned). */
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
      // Unreachable (categories come from DEFAULT_PROMPTS); skipped because `noUncheckedIndexedAccess` types `Map.get`
      // as possibly undefined and inserting `undefined` into a NOT NULL column is worse.
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

  /** Existence check scoped to the tenant, for `PromptsService.getVersionStats` when no `version` is given. */
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

  /** Keyed by category, not `prompts.id`: generation only knows the category. `null` means no prompt for it, which
   *  shouldn't happen (all three are seeded at signup) but can in a hand-edited dev database. */
  async findCurrentForCategory(
    tenantId: string,
    category: PromptCategory
  ): Promise<CurrentPromptForCategory | null> {
    const prompt = await this.promptsRepository.findByTenantAndCategory(tenantId, category);
    if (prompt === null) {
      return null;
    }

    const version = await this.promptsRepository.findCurrentVersion(prompt.id, tenantId);
    // Every prompt is seeded with a v1 in the same transaction, so a versionless prompt is as anomalous as a missing one.
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
