import { ApiClient, ApiError } from "@/app/_libs/services/api-client";
import type { AiPrompt, PromptTone, PromptVersion } from "@/types/domain";

export { ApiError as PromptApiError };

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
 * Prompt management against the NestJS prompts API. Hooks call this class, never ApiClient directly.
 */
export class PromptService {
  static async getPrompts(): Promise<AiPrompt[]> {
    const data = await ApiClient.request<ApiPromptList>("/v1/prompts?includeHistory=true");
    return data.prompts.map(mapPrompt);
  }

  static async createVersion(prompt: AiPrompt, template: string): Promise<AiPrompt> {
    const created = await ApiClient.request<ApiCreateVersionResponse>(
      `/v1/prompts/${prompt.id}/versions`,
      { method: "POST", body: { template } },
    );

    const nextVersion: PromptVersion = mapVersion(created.version);
    return {
      ...prompt,
      versions: [...prompt.versions, nextVersion],
    };
  }

  static async updateTone(prompt: AiPrompt, tone: PromptTone): Promise<AiPrompt> {
    const updated = await ApiClient.request<ApiUpdateToneResponse>(`/v1/prompts/${prompt.id}/tone`, {
      method: "PUT",
      body: { tone },
    });
    return { ...prompt, tone: updated.tone };
  }
}
