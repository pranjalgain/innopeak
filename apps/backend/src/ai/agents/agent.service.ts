import { AiService } from '@ai/ai.service';
import { ChatCompletionOptions, ChatMessage } from '@ai/interfaces/ai-provider.interface';
import { AgentsRepository, ConversationRow } from '@db/repositories/ai/agents.repository';
import { Injectable, Logger } from '@nestjs/common';

import { ConversationMemoryService } from './conversation-memory.service';
import { AgentConfig, AgentResult, AgentTurn } from './interfaces/agent.interface';
import { ConversationMemory } from './interfaces/memory.interface';
import { ToolRegistryService } from './tool-registry.service';

/** Default values for the agent loop. */
const DEFAULT_MAX_TURNS = 10;
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI assistant. When you need information, use the available tools. ' +
  'Always provide clear, accurate responses based on the information you gather.';

/**
 * Core agent orchestrator. Manages the tool-calling loop:
 *
 *   1. Load or create conversation
 *   2. Build message array (system prompt + history + user message)
 *   3. Call AI chat completion with tool definitions
 *   4. If response has tool calls, execute them and loop
 *   5. Save all messages to memory
 *   6. Return the final response
 *
 * This service performs NO direct database calls -- all persistence
 * goes through ConversationMemoryService / AgentsRepository.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly memoryService: ConversationMemoryService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly agentsRepository: AgentsRepository
  ) {}

  // ─── Chat (main entry point) ───────────────────────────────────────────────

  /**
   * Send a message to the agent and get a response.
   *
   * If `conversationId` is null, a new conversation is created.
   * The agent will loop through tool calls until a final text response
   * is produced or the max-turns limit is reached.
   */
  async chat(
    userId: string,
    conversationId: string | null,
    message: string,
    config?: AgentConfig
  ): Promise<AgentResult> {
    const model = config?.model ?? DEFAULT_MODEL;
    const systemPrompt = config?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const maxTurns = config?.maxTurns ?? DEFAULT_MAX_TURNS;
    const temperature = config?.temperature;
    const provider = config?.provider;

    // ── Step 1: Resolve or create conversation ───────────────────────────
    let resolvedConversationId: string;
    let history: ChatMessage[] = [];

    if (conversationId) {
      resolvedConversationId = conversationId;
      const memory = await this.memoryService.loadConversation(conversationId);
      if (memory) {
        history = memory.messages;
      }
    } else {
      const conversation = await this.agentsRepository.createConversation(
        userId,
        model,
        undefined,
        systemPrompt
      );
      resolvedConversationId = conversation.id;
    }

    // ── Step 2: Build the messages array ─────────────────────────────────
    const messagesArray: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ];

    // Save the user message
    await this.memoryService.saveMessage(resolvedConversationId, 'user', message);

    // ── Step 3: Tool definitions ─────────────────────────────────────────
    const toolDefinitions = config?.tools ?? this.toolRegistry.getDefinitions();

    // ── Step 4: Agent loop ───────────────────────────────────────────────
    const turns: AgentTurn[] = [];
    let totalTokens = 0;
    let finalResponse = '';
    const currentMessages = [...messagesArray];

    for (let turn = 0; turn < maxTurns; turn++) {
      this.logger.debug(
        `Agent turn ${String(turn + 1)}/${String(maxTurns)} for conversation ${resolvedConversationId}`
      );

      let aiResponse;
      try {
        const completionOptions: ChatCompletionOptions = {
          messages: currentMessages,
          model,
        };

        if (toolDefinitions.length > 0) {
          completionOptions.tools = toolDefinitions;
        }

        if (temperature !== undefined) {
          completionOptions.temperature = temperature;
        }

        aiResponse = await this.aiService.chatCompletion(completionOptions, provider);
      } catch (error) {
        const errorMessage = (error as Error).message;
        this.logger.error(`AI chat completion failed: ${errorMessage}`);

        // Save error as assistant message and return
        const errorContent = `I encountered an error processing your request: ${errorMessage}`;
        await this.memoryService.saveMessage(resolvedConversationId, 'assistant', errorContent);

        turns.push({ role: 'assistant', content: errorContent });
        finalResponse = errorContent;
        break;
      }

      const result = aiResponse.data;
      totalTokens += result.usage.totalTokens;

      // Record this turn
      const assistantTurn: AgentTurn = {
        role: result.role,
        content: result.content,
        ...(result.toolCalls && result.toolCalls.length > 0 ? { toolCalls: result.toolCalls } : {}),
      };
      turns.push(assistantTurn);

      // ── No tool calls: final response ────────────────────────────────
      if (
        !result.toolCalls ||
        result.toolCalls.length === 0 ||
        result.finishReason !== 'tool_calls'
      ) {
        finalResponse = result.content;

        // Save assistant response
        await this.memoryService.saveMessage(
          resolvedConversationId,
          'assistant',
          result.content,
          undefined,
          result.usage.totalTokens
        );

        this.logger.debug(
          `Agent completed in ${String(turn + 1)} turn(s), ${String(totalTokens)} total tokens`
        );
        break;
      }

      // ── Process tool calls ───────────────────────────────────────────
      // Add assistant message with tool calls to the conversation
      currentMessages.push({
        role: 'assistant',
        content: result.content || '',
      });

      // Save assistant turn with tool calls
      await this.memoryService.saveMessage(
        resolvedConversationId,
        'assistant',
        result.content || `[Tool calls: ${result.toolCalls.map(tc => tc.name).join(', ')}]`,
        result.toolCalls,
        result.usage.totalTokens
      );

      // Execute each tool call and add results
      for (const toolCall of result.toolCalls) {
        let toolResult: string;

        try {
          const parsedArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>;
          toolResult = await this.toolRegistry.execute(toolCall.name, parsedArgs);
        } catch (error) {
          const errorMessage = (error as Error).message;
          this.logger.error(`Tool "${toolCall.name}" execution failed: ${errorMessage}`);
          toolResult = `Error executing tool "${toolCall.name}": ${errorMessage}`;
        }

        // Add tool result as a tool message
        currentMessages.push({
          role: 'tool',
          content: `[Tool: ${toolCall.name}]\n${toolResult}`,
        });

        // Save tool result
        await this.memoryService.saveMessage(
          resolvedConversationId,
          'tool',
          `[Tool: ${toolCall.name}]\n${toolResult}`
        );

        // Record tool turn
        turns.push({
          role: 'tool',
          content: toolResult,
        });
      }

      // If this is the last allowed turn, force a final response
      if (turn === maxTurns - 1) {
        this.logger.warn(
          `Agent reached max turns (${String(maxTurns)}) for conversation ${resolvedConversationId}`
        );

        finalResponse =
          result.content ||
          'I reached the maximum number of processing steps. Please try simplifying your request.';

        await this.memoryService.saveMessage(resolvedConversationId, 'assistant', finalResponse);
      }
    }

    // ── Auto-title: if this is a new conversation, generate a title ──────
    if (!conversationId && finalResponse.length > 0) {
      await this.autoGenerateTitle(resolvedConversationId, message);
    }

    return {
      turns,
      finalResponse,
      conversationId: resolvedConversationId,
      totalTokens,
    };
  }

  // ─── Conversation Management ───────────────────────────────────────────────

  /**
   * List conversations for a user (paginated).
   */
  async listConversations(
    userId: string,
    page: number,
    pageSize: number
  ): Promise<{ data: ConversationRow[]; total: number }> {
    return this.agentsRepository.findConversationsByUserId(userId, page, pageSize);
  }

  /**
   * Get a single conversation with all messages.
   */
  async getConversation(conversationId: string): Promise<ConversationMemory | null> {
    return this.memoryService.loadConversation(conversationId);
  }

  /**
   * Delete a conversation and all associated messages.
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.agentsRepository.deleteConversation(conversationId);
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Auto-generate a short title for a new conversation based on the
   * user's first message.
   */
  private async autoGenerateTitle(conversationId: string, firstMessage: string): Promise<void> {
    try {
      const titleResponse = await this.aiService.chatCompletion({
        messages: [
          {
            role: 'system',
            content:
              'Generate a very short title (max 50 characters) for a conversation that starts with the following message. ' +
              'Respond with ONLY the title, no quotes or punctuation.',
          },
          { role: 'user', content: firstMessage },
        ],
        maxTokens: 30,
        temperature: 0.5,
      });

      const title = titleResponse.data.content.trim().slice(0, 50);
      if (title.length > 0) {
        await this.agentsRepository.updateConversationTitle(conversationId, title);
      }
    } catch (error) {
      // Non-critical: log and continue
      this.logger.warn(`Failed to auto-generate title: ${(error as Error).message}`);
    }
  }
}
