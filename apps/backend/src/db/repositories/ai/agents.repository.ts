import { DBService } from '@db/db.service';
import { conversations, messages } from '@db/drizzle/schema';
import { Injectable, Logger } from '@nestjs/common';
import { asc, count, desc, eq, sql } from 'drizzle-orm';

// ─── Row Types ──────────────────────────────────────────────────────────────

export interface ConversationRow {
  id: string;
  userId: string;
  title: string | null;
  model: string;
  systemPrompt: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  toolCalls: unknown;
  tokenCount: number;
  createdAt: Date;
}

@Injectable()
export class AgentsRepository {
  private readonly logger = new Logger(AgentsRepository.name);

  constructor(private readonly dbService: DBService) {}

  // ─── Conversations ─────────────────────────────────────────────────────────

  /**
   * Create a new conversation record.
   */
  async createConversation(
    userId: string,
    model: string,
    title?: string,
    systemPrompt?: string
  ): Promise<ConversationRow> {
    const [row] = await this.dbService.db
      .insert(conversations)
      .values({
        userId,
        model,
        title: title ?? null,
        systemPrompt: systemPrompt ?? null,
      })
      .returning();

    if (!row) {
      throw new Error('Failed to create conversation');
    }

    this.logger.debug(`Created conversation ${row.id} for user ${userId}`);

    return row;
  }

  /**
   * Find a conversation by its ID.
   */
  async findConversationById(id: string): Promise<ConversationRow | null> {
    const [row] = await this.dbService.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    return row ?? null;
  }

  /**
   * List conversations for a user with pagination, ordered by most recent.
   */
  async findConversationsByUserId(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ data: ConversationRow[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      this.dbService.db
        .select({ count: count() })
        .from(conversations)
        .where(eq(conversations.userId, userId)),
      this.dbService.db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, userId))
        .orderBy(desc(conversations.updatedAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return { data: rows, total };
  }

  /**
   * Update the title of a conversation.
   */
  async updateConversationTitle(id: string, title: string): Promise<ConversationRow | null> {
    const [row] = await this.dbService.db
      .update(conversations)
      .set({ title, updatedAt: sql`now()` })
      .where(eq(conversations.id, id))
      .returning();

    return row ?? null;
  }

  /**
   * Delete a conversation and all its messages (cascade via FK).
   */
  async deleteConversation(id: string): Promise<void> {
    await this.dbService.db.delete(conversations).where(eq(conversations.id, id));

    this.logger.debug(`Deleted conversation ${id}`);
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  /**
   * Add a message to a conversation.
   */
  async addMessage(
    conversationId: string,
    role: string,
    content: string,
    toolCalls?: unknown,
    tokenCount?: number
  ): Promise<MessageRow> {
    const values: Record<string, unknown> = {
      conversationId,
      role,
      content,
      toolCalls: toolCalls ?? null,
    };

    // tokenCount is a serial column with auto-increment, only set if provided
    if (tokenCount !== undefined) {
      values['tokenCount'] = tokenCount;
    }

    const [row] = await this.dbService.db
      .insert(messages)
      .values(values as typeof messages.$inferInsert)
      .returning();

    if (!row) {
      throw new Error('Failed to add message');
    }

    // Touch the conversation's updatedAt timestamp
    await this.dbService.db
      .update(conversations)
      .set({ updatedAt: sql`now()` })
      .where(eq(conversations.id, conversationId));

    return row;
  }

  /**
   * Get messages for a conversation, ordered by creation time (ascending).
   * Optionally limit the number of messages returned.
   */
  async getMessages(conversationId: string, limit?: number): Promise<MessageRow[]> {
    let query = this.dbService.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .$dynamic();

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query;
  }
}
