/**
 * Barrel re-exports for AI interfaces.
 *
 * Consumers can import from either the specific interface file or this barrel.
 */

// ─── Chat Completion ────────────────────────────────────────────────────────

export type {
  ChatMessage,
  ToolDefinition,
  ToolCall,
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
  StructuredOutputOptions,
} from './ai-provider.interface';

// ─── Config ─────────────────────────────────────────────────────────────────

export type { AiConfig } from './ai-config.interface';

// ─── Response Wrapper ───────────────────────────────────────────────────────

export type { AiResponse } from './ai-response.interface';
