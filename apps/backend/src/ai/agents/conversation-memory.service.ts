import { AiService } from '@ai/ai.service';
import { ChatMessage } from '@ai/interfaces/ai-provider.interface';
import { AgentsRepository } from '@db/repositories/ai/agents.repository';
import { Injectable, Logger } from '@nestjs/common';

import { ConversationMemory } from './interfaces/memory.interface';

/** Approximate characters per token for sliding-window estimation. */
const CHARS_PER_TOKEN = 4;

/**
 * Manages conversation memory (loading, saving, truncation) via the
 * AgentsRepository. This service performs NO direct database calls.
 */
@Injectable()
export class ConversationMemoryService {
  private readonly logger = new Logger(ConversationMemoryService.name);

  constructor(private readonly agentsRepository: AgentsRepository) {}

  // ─── Load ──────────────────────────────────────────────────────────────────

  /**
   * Load a full conversation (metadata + messages) from the repository.
   *
   * @returns The conversation memory, or `null` if the conversation does not exist.
   */
  async loadConversation(conversationId: string): Promise<ConversationMemory | null> {
    const conversation = await this.agentsRepository.findConversationById(conversationId);

    if (!conversation) {
      return null;
    }

    const messageRows = await this.agentsRepository.getMessages(conversationId);

    const chatMessages: ChatMessage[] = messageRows.map(row => ({
      role: row.role as ChatMessage['role'],
      content: row.content,
    }));

    return {
      conversationId: conversation.id,
      userId: conversation.userId,
      title: conversation.title,
      model: conversation.model,
      systemPrompt: conversation.systemPrompt,
      messages: chatMessages,
      createdAt: conversation.createdAt,
    };
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  /**
   * Persist a single message to the conversation.
   */
  async saveMessage(
    conversationId: string,
    role: string,
    content: string,
    toolCalls?: unknown,
    tokenCount?: number
  ): Promise<void> {
    await this.agentsRepository.addMessage(conversationId, role, content, toolCalls, tokenCount);
  }

  // ─── Sliding Window ────────────────────────────────────────────────────────

  /**
   * Return the most recent messages from a conversation that fit within
   * a given token budget. Uses a rough character-based estimation
   * (4 characters ~ 1 token).
   *
   * Messages are returned in chronological order (oldest first).
   *
   * @param conversationId - The conversation to read from.
   * @param maxTokens      - Maximum estimated token count for the returned messages.
   */
  async getRecentMessages(conversationId: string, maxTokens: number): Promise<ChatMessage[]> {
    const allRows = await this.agentsRepository.getMessages(conversationId);

    // Walk backwards from the most recent message, accumulating estimated tokens
    const selected: ChatMessage[] = [];
    let estimatedTokens = 0;
    const maxChars = maxTokens * CHARS_PER_TOKEN;

    for (let i = allRows.length - 1; i >= 0; i--) {
      const row = allRows[i];
      if (row === undefined) {
        continue;
      }
      const messageChars = row.content.length + row.role.length;

      if (estimatedTokens + messageChars > maxChars && selected.length > 0) {
        break;
      }

      selected.unshift({
        role: row.role as ChatMessage['role'],
        content: row.content,
      });
      estimatedTokens += messageChars;
    }

    this.logger.debug(
      `Sliding window: ${String(selected.length)}/${String(allRows.length)} messages ` +
        `(~${String(Math.ceil(estimatedTokens / CHARS_PER_TOKEN))} tokens)`
    );

    return selected;
  }

  // ─── Summarize & Truncate ──────────────────────────────────────────────────

  /**
   * Summarize the full conversation history into a single system-level
   * summary message, then keep only that summary plus the most recent
   * messages. Useful for long-running conversations that exceed context limits.
   *
   * @param conversationId - The conversation to summarize.
   * @param aiService      - The AI service to generate the summary (injected by caller).
   */
  async summarizeAndTruncate(conversationId: string, aiService: AiService): Promise<void> {
    const allRows = await this.agentsRepository.getMessages(conversationId);

    if (allRows.length <= 10) {
      this.logger.debug(
        `Conversation ${conversationId} has ${String(allRows.length)} messages — skipping summarization`
      );
      return;
    }

    // Build a transcript of all messages for summarization
    const transcript = allRows.map(row => `${row.role}: ${row.content}`).join('\n');

    const summaryResponse = await aiService.chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a summarization assistant. Condense the following conversation ' +
            'into a concise summary that preserves key context, decisions, and any ' +
            'important information. Keep it under 500 words.',
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      maxTokens: 1000,
      temperature: 0.3,
    });

    const summaryText = summaryResponse.data.content;

    // Save the summary as a system message
    await this.agentsRepository.addMessage(
      conversationId,
      'system',
      `[Conversation Summary] ${summaryText}`
    );

    this.logger.log(
      `Summarized conversation ${conversationId}: ${String(allRows.length)} messages -> summary`
    );
  }
}
