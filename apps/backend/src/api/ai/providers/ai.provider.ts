import type { GenerateReplyInput, GenerateReplyResult } from '../types/ai-provider.type';

/** Swappable model backend; callers depend only on this abstract type, implementations are chosen in `AiModule`'s factory. */
export abstract class AiProvider {
  abstract generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
