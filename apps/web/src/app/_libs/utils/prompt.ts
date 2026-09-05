import type { AiPrompt, PromptVersion } from "@/types/domain";

export function getCurrentVersion(prompt: AiPrompt): PromptVersion {
  return prompt.versions[prompt.versions.length - 1];
}
