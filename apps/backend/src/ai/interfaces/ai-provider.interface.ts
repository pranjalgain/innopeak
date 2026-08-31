/**
 * Common interfaces for AI provider abstraction.
 * All AI vendors (Claude, OpenAI, etc.) map to these types so the
 * service layer stays provider-agnostic.
 */

// ─── Chat ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'assistant' | 'system' | 'tool' | 'user';
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ChatCompletionResult {
  content: string;
  role: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: ToolCall[];
  finishReason: string;
}

// ─── Embeddings ────────────────────────────────────────────────────────────────

export interface EmbeddingOptions {
  input: string[] | string;
  model?: string;
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  usage: {
    totalTokens: number;
  };
}

// ─── Structured Output ─────────────────────────────────────────────────────────

export interface StructuredOutputOptions<_T = unknown> {
  messages: ChatMessage[];
  model?: string;
  schema: Record<string, unknown>;
  schemaName: string;
}
