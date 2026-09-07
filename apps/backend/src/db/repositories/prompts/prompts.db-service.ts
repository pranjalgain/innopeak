import { Injectable } from '@nestjs/common';

import { PromptsRepository } from './prompts.repository';

import type { PromptToneValue } from '../../../api/prompts/constants/prompts.constants';
import { PROMPT_VERSION_APPEND_RETRY_LIMIT } from '../../../api/prompts/constants/prompts.constants';
import type {
  AppendedPromptVersion,
  PromptRecord,
  PromptVersionRecord,
  PromptWithVersions,
} from '../../../api/prompts/types/prompt.type';

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4; i += 1) {
    if (
      typeof current === 'object' &&
      current !== null &&
      'code' in current &&
      (current as { code: unknown }).code === '23505'
    ) {
      return true;
    }
    if (typeof current === 'object' && current !== null && 'cause' in current) {
      current = (current as { cause: unknown }).cause;
      continue;
    }
    return false;
  }
  return false;
}

@Injectable()
export class PromptsDbService {
  constructor(private readonly promptsRepository: PromptsRepository) {}

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

  async getCurrentVersion(promptId: string, tenantId: string): Promise<PromptVersionRecord | null> {
    const prompt = await this.promptsRepository.findByIdForTenant(promptId, tenantId);
    if (prompt === null) {
      return null;
    }
    return this.promptsRepository.findCurrentVersion(promptId);
  }

  async updateTone(
    promptId: string,
    tenantId: string,
    tone: PromptToneValue
  ): Promise<PromptRecord | null> {
    return this.promptsRepository.updateTone(promptId, tenantId, tone);
  }

  async appendVersion(
    promptId: string,
    tenantId: string,
    template: string,
    createdByUserId: string | null
  ): Promise<AppendedPromptVersion | null> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= PROMPT_VERSION_APPEND_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.promptsRepository.appendVersion(
          promptId,
          tenantId,
          template,
          createdByUserId
        );
      } catch (error: unknown) {
        if (!isUniqueViolation(error) || attempt === PROMPT_VERSION_APPEND_RETRY_LIMIT) {
          throw error;
        }
        lastError = error;
      }
    }

    throw lastError;
  }

  async countVersions(promptId: string): Promise<number> {
    return this.promptsRepository.countVersions(promptId);
  }
}
