import { promptsApi } from "@/app/_libs/api-sdk/prompts-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { AiPrompt, PromptTone, PromptVersion, PromptVersionStats } from "@/types/domain";

export { ApiError as PromptApiError } from "@/app/_libs/services/api-error";

interface ApiCreatedBy {
  userId: string;
  name: string | null;
}

interface ApiPromptVersion {
  id: string;
  version: number;
  template: string;
  createdAt: string;
  createdBy: ApiCreatedBy | null;
}

interface ApiPrompt {
  id: string;
  name: string;
  description: string;
  tone: PromptTone;
  currentVersion: ApiPromptVersion;
  versions?: ApiPromptVersion[];
}

interface ApiPromptList {
  prompts: ApiPrompt[];
}

interface ApiCreateVersionResponse {
  promptId: string;
  version: ApiPromptVersion;
  versionCount: number;
}

interface ApiUpdateToneResponse {
  promptId: string;
  tone: PromptTone;
}

type ApiPromptVersionStats = PromptVersionStats;

export interface PromptStatsPair {
  promptId: string;
  version: number;
}

interface ApiPromptStatsBatchItem {
  promptId: string;
  version: number;
  stats: ApiPromptVersionStats;
}

interface ApiPromptStatsBatchResponse {
  results: ApiPromptStatsBatchItem[];
}

/**
 * Shown as the author of a version nobody edited. Hardcoded here rather than translated because
 * this layer has no translator — the surrounding strings in this file are the same, so pulling
 * i18n in for one label would be inconsistent. Worth revisiting if the service ever gets a `t`.
 */
const SYSTEM_AUTHOR_LABEL = "InnoPeak default";

function mapVersion(version: ApiPromptVersion): PromptVersion {
  return {
    version: version.version,
    template: version.template,
    updatedAt: version.createdAt,
    // A null author means nobody edited it — `created_by_user_id` is NULL on the default
    // templates the tenant starts with, so every tenant's v1 lands here. "Unknown" read
    // like a bug for those.
    updatedByName: version.createdBy?.name ?? SYSTEM_AUTHOR_LABEL,
  };
}

function mapPrompt(prompt: ApiPrompt): AiPrompt {
  const history = prompt.versions ?? [prompt.currentVersion];
  return {
    id: prompt.id,
    name: prompt.name,
    description: prompt.description,
    tone: prompt.tone,
    versions: history.map(mapVersion),
  };
}

/**
 * Prompt management against the NestJS prompts API. Hooks call this class, never the generated
 * SDK directly.
 */
export class PromptService {
  static async getPrompts(): Promise<AiPrompt[]> {
    const response = await promptsApi.promptsControllerListV1({ includeHistory: true });
    const data = unwrap<ApiPromptList>(response.data);
    return data.prompts.map(mapPrompt);
  }

  static async createVersion(prompt: AiPrompt, template: string): Promise<AiPrompt> {
    const response = await promptsApi.promptsControllerCreateVersionV1({
      promptId: prompt.id,
      createPromptVersionDto: { template },
    });
    const created = unwrap<ApiCreateVersionResponse>(response.data);

    const nextVersion: PromptVersion = mapVersion(created.version);
    return {
      ...prompt,
      versions: [...prompt.versions, nextVersion],
    };
  }

  static async updateTone(prompt: AiPrompt, tone: PromptTone): Promise<AiPrompt> {
    const response = await promptsApi.promptsControllerUpdateToneV1({
      promptId: prompt.id,
      updatePromptToneDto: { tone },
    });
    const updated = unwrap<ApiUpdateToneResponse>(response.data);
    return { ...prompt, tone: updated.tone };
  }

  static async getVersionStats(promptId: string, version: number): Promise<PromptVersionStats> {
    const response = await promptsApi.promptsControllerGetVersionStatsV1({ promptId, version });
    return unwrap<ApiPromptVersionStats>(response.data);
  }

  /**
   * One request for every (promptId, version) pair given — the batch counterpart to
   * `getVersionStats`, used by `usePromptAnalytics` so rendering a prompt list's current-version
   * stats costs one round trip instead of one per prompt.
   */
  static async getVersionStatsBatch(pairs: PromptStatsPair[]): Promise<ApiPromptStatsBatchItem[]> {
    if (pairs.length === 0) return [];

    const response = await promptsApi.promptsControllerGetVersionStatsBatchV1({
      getPromptStatsBatchDto: { pairs },
    });
    const data = unwrap<ApiPromptStatsBatchResponse>(response.data);
    return data.results;
  }
}
