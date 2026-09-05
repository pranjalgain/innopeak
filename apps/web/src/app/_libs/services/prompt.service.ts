import { MOCK_PROMPTS } from "@/app/_libs/mock-data/prompts";
import type { AiPrompt, PromptTone } from "@/types/domain";

/**
 * AI prompt management service. Mock implementation — becomes a real
 * backend call once that API exists. Hooks and components only ever call
 * `usePrompts`, never this class directly.
 */
export class PromptService {
  static async getPrompts(): Promise<AiPrompt[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return structuredClone(MOCK_PROMPTS);
  }

  /** Appends a new version — edits are never overwritten in place. */
  static async createVersion(prompt: AiPrompt, template: string, updatedByName: string): Promise<AiPrompt> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const nextVersion = prompt.versions.length + 1;
    return {
      ...prompt,
      versions: [...prompt.versions, { version: nextVersion, template, updatedAt: new Date().toISOString(), updatedByName }],
    };
  }

  /** The tenant's tone for this prompt — a live setting, not per-owner. */
  static async updateTone(prompt: AiPrompt, tone: PromptTone): Promise<AiPrompt> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { ...prompt, tone };
  }
}
