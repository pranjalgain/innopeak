/**
 * Unified response wrapper returned by AiService.
 * Includes the provider result plus cross-cutting metadata (latency, provider name).
 */
export interface AiResponse<T> {
  data: T;
  provider: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}
