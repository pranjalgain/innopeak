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
  /** Resolved from `users.name`. Null when the author was never recorded (seeded rows) or has since been deleted — `created_by_user_id` is ON DELETE SET NULL. */
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

/** Groups `PromptsRepository`/`PromptsDbService`'s `updateTone` trailing scalars (rule 12). */
export interface UpdatePromptToneInput {
  promptId: string;
  tenantId: string;
  tone: PromptToneValue;
}

/** Groups `PromptsRepository`/`PromptsDbService`'s `appendVersion` trailing scalars (rule 12). */
export interface AppendPromptVersionInput {
  promptId: string;
  tenantId: string;
  template: string;
  createdByUserId: string | null;
}
