import type { GenerateReplyInput, GenerateReplyResult } from '../types/ai-provider.type';

/**
 * Swappable model-backend abstraction — same DI-swap shape as `PaymentProvider`/`EmailProvider`/
 * `StorageProvider`. `OpenRouterAiProvider` is the only implementation today; a future
 * `AzureOpenAiProvider` (the GDPR-required, `westeurope`-pinned deployment per PLAN.md §5) is
 * meant to be a second concrete class here plus one new `case` in `AiModule`'s factory, nothing
 * else — every caller only ever depends on this abstract type.
 */
export abstract class AiProvider {
  abstract generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}
