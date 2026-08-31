import type { ChatMessage } from '@ai/interfaces/ai-provider.interface';

/**
 * In-memory representation of a conversation loaded from the database.
 * Used by the ConversationMemoryService for context management.
 */
export interface ConversationMemory {
  conversationId: string;
  userId: string;
  title: string | null;
  model: string;
  systemPrompt: string | null;
  messages: ChatMessage[];
  createdAt: Date;
}
