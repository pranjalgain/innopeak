import type { PromptToneValue } from '../constants/prompts.constants';

export type PromptCategory = 'escalated' | 'neutral' | 'positive';
export type PromptTone = 'empathetic' | 'formal' | 'friendly' | 'playful' | 'professional';

export interface PromptCreatedBy {
  userId: string;
  name: string | null;
}

export interface PromptVersionRecord {
  id: string;
  promptId: string;
  version: number;
  template: string;
  createdAt: Date;
  createdByUserId: string | null;
  /** Null when the author was never recorded (seeded rows) or was deleted (`created_by_user_id` is ON DELETE SET NULL). */
  createdByName: string | null;
}

export interface PromptRecord {
  id: string;
  tenantId: string;
  category: PromptCategory;
  name: string;
  description: string | null;
  tone: PromptTone;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptWithVersions {
  prompt: PromptRecord;
  versions: PromptVersionRecord[];
}

export interface AppendedPromptVersion {
  id: string;
  version: number;
  template: string;
  createdAt: Date;
  createdByUserId: string | null;
  createdByName: string | null;
}

export interface UpdatePromptToneInput {
  promptId: string;
  tenantId: string;
  tone: PromptToneValue;
}

export interface AppendPromptVersionInput {
  promptId: string;
  tenantId: string;
  template: string;
  createdByUserId: string | null;
}

/** Only what generation reads: live tone plus the current version's template. */
export interface CurrentPromptForCategory {
  promptId: string;
  /** `prompt_versions.id` of the version `template` came from: stamped on every draft it generates, which is what Settings > Prompts counts by. */
  promptVersionId: string;
  tone: PromptTone;
  template: string;
}
