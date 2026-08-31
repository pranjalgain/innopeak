import type { ToolCall, ToolDefinition } from '@ai/interfaces/ai-provider.interface';

// ─── Agent Configuration ─────────────────────────────────────────────────────

export interface AgentConfig {
  model?: string;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxTurns?: number;
  temperature?: number;
  provider?: string;
}

// ─── Agent Turn (single round of interaction) ───────────────────────────────

export interface AgentTurn {
  role: string;
  content: string;
  toolCalls?: ToolCall[];
}

// ─── Agent Result (full response) ────────────────────────────────────────────

export interface AgentResult {
  turns: AgentTurn[];
  finalResponse: string;
  conversationId: string;
  totalTokens: number;
}
