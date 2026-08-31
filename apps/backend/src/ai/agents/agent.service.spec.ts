import { AiService } from '@ai/ai.service';
import type { ChatCompletionResult } from '@ai/interfaces/ai-provider.interface';
import type { AiResponse } from '@ai/interfaces/ai-response.interface';
import type { ConversationRow } from '@db/repositories/ai/agents.repository';
import { AgentsRepository } from '@db/repositories/ai/agents.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AgentService } from './agent.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { ToolRegistryService } from './tool-registry.service';

describe('AgentService', () => {
  let target: AgentService;
  let aiService: { chatCompletion: jest.Mock };
  let memoryService: {
    loadConversation: jest.Mock;
    saveMessage: jest.Mock;
  };
  let toolRegistry: { getDefinitions: jest.Mock; execute: jest.Mock };
  let agentsRepository: {
    createConversation: jest.Mock;
    findConversationsByUserId: jest.Mock;
    deleteConversation: jest.Mock;
    updateConversationTitle: jest.Mock;
  };

  const makeConversationRow = (overrides: Partial<ConversationRow> = {}): ConversationRow => ({
    id: 'conv-1',
    userId: 'user-1',
    title: null,
    model: 'gpt-4o',
    systemPrompt: null,
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  const makeAiResponse = (
    overrides: Partial<ChatCompletionResult> = {}
  ): AiResponse<ChatCompletionResult> => ({
    data: {
      content: 'final answer',
      role: 'assistant',
      model: 'gpt-4o',
      usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      finishReason: 'stop',
      ...overrides,
    },
    provider: 'openai',
    model: 'gpt-4o',
    usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
    latencyMs: 12,
  });

  beforeEach(async () => {
    aiService = { chatCompletion: jest.fn() };
    memoryService = { loadConversation: jest.fn(), saveMessage: jest.fn() };
    toolRegistry = { getDefinitions: jest.fn().mockReturnValue([]), execute: jest.fn() };
    agentsRepository = {
      createConversation: jest.fn().mockResolvedValue(makeConversationRow()),
      findConversationsByUserId: jest.fn(),
      deleteConversation: jest.fn(),
      updateConversationTitle: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        { provide: AiService, useValue: aiService },
        { provide: ConversationMemoryService, useValue: memoryService },
        { provide: ToolRegistryService, useValue: toolRegistry },
        { provide: AgentsRepository, useValue: agentsRepository },
      ],
    }).compile();

    target = module.get(AgentService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('chat', () => {
    it('creates a new conversation, returns the final response, and auto-generates a title', async () => {
      aiService.chatCompletion
        .mockResolvedValueOnce(makeAiResponse({ content: 'Hello! How can I help?' }))
        .mockResolvedValueOnce(makeAiResponse({ content: 'Greeting' }));

      const result = await target.chat('user-1', null, 'hi there');

      expect(agentsRepository.createConversation).toHaveBeenCalledWith(
        'user-1',
        'gpt-4o',
        undefined,
        expect.any(String)
      );
      expect(result.conversationId).toBe('conv-1');
      expect(result.finalResponse).toBe('Hello! How can I help?');
      expect(result.totalTokens).toBe(10);
      expect(memoryService.saveMessage).toHaveBeenCalledWith('conv-1', 'user', 'hi there');
      expect(memoryService.saveMessage).toHaveBeenCalledWith(
        'conv-1',
        'assistant',
        'Hello! How can I help?',
        undefined,
        10
      );
      expect(agentsRepository.updateConversationTitle).toHaveBeenCalledWith('conv-1', 'Greeting');
    });

    it('continues an existing conversation using its stored history and skips auto-titling', async () => {
      memoryService.loadConversation.mockResolvedValue({
        conversationId: 'conv-42',
        userId: 'user-1',
        title: 'Existing chat',
        model: 'gpt-4o',
        systemPrompt: null,
        messages: [{ role: 'user', content: 'previous message' }],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      aiService.chatCompletion.mockResolvedValueOnce(
        makeAiResponse({ content: 'continued reply' })
      );

      const result = await target.chat('user-1', 'conv-42', 'follow up');

      expect(agentsRepository.createConversation).not.toHaveBeenCalled();
      expect(result.conversationId).toBe('conv-42');
      expect(result.finalResponse).toBe('continued reply');
      expect(agentsRepository.updateConversationTitle).not.toHaveBeenCalled();
      // Only one chatCompletion call for the main loop, no title generation call.
      expect(aiService.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('falls back to an empty history when the referenced conversation is not found', async () => {
      memoryService.loadConversation.mockResolvedValue(null);
      aiService.chatCompletion.mockResolvedValueOnce(makeAiResponse({ content: 'ok' }));

      const result = await target.chat('user-1', 'missing-conv', 'hello');

      expect(result.finalResponse).toBe('ok');
      expect(result.conversationId).toBe('missing-conv');
    });

    it('executes tool calls returned by the AI and feeds results back in a subsequent turn', async () => {
      aiService.chatCompletion
        .mockResolvedValueOnce(
          makeAiResponse({
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'call-1', name: 'search', arguments: '{"query":"docs"}' }],
          })
        )
        .mockResolvedValueOnce(makeAiResponse({ content: 'Here is what I found' }))
        .mockResolvedValueOnce(makeAiResponse({ content: 'Title response' }));
      toolRegistry.execute.mockResolvedValue('search results here');

      const result = await target.chat('user-1', null, 'search for docs');

      expect(toolRegistry.execute).toHaveBeenCalledWith('search', { query: 'docs' });
      expect(result.finalResponse).toBe('Here is what I found');
      expect(result.turns.some(turn => turn.role === 'tool')).toBe(true);
      expect(memoryService.saveMessage).toHaveBeenCalledWith(
        'conv-1',
        'tool',
        '[Tool: search]\nsearch results here'
      );
    });

    it('records a tool-execution error as the tool result instead of throwing', async () => {
      aiService.chatCompletion
        .mockResolvedValueOnce(
          makeAiResponse({
            content: '',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'call-1', name: 'broken-tool', arguments: '{}' }],
          })
        )
        .mockResolvedValueOnce(makeAiResponse({ content: 'recovered' }))
        .mockResolvedValueOnce(makeAiResponse({ content: 'Title' }));
      toolRegistry.execute.mockRejectedValue(new Error('tool blew up'));

      const result = await target.chat('user-1', null, 'do something');

      const toolTurn = result.turns.find(turn => turn.role === 'tool');
      expect(toolTurn?.content).toContain('Error executing tool "broken-tool": tool blew up');
      expect(result.finalResponse).toBe('recovered');
    });

    it('forces a final response once the max-turns limit is reached', async () => {
      aiService.chatCompletion.mockResolvedValue(
        makeAiResponse({
          content: 'still working',
          finishReason: 'tool_calls',
          toolCalls: [{ id: 'call-1', name: 'search', arguments: '{}' }],
        })
      );
      toolRegistry.execute.mockResolvedValue('partial result');

      const result = await target.chat('user-1', null, 'loop forever', { maxTurns: 1 });

      expect(result.finalResponse).toBe('still working');
      expect(memoryService.saveMessage).toHaveBeenCalledWith(
        'conv-1',
        'assistant',
        'still working'
      );
    });

    it('catches AI completion errors and returns a descriptive error response instead of throwing', async () => {
      aiService.chatCompletion.mockRejectedValue(new Error('rate limit exceeded'));

      const result = await target.chat('user-1', null, 'hello');

      expect(result.finalResponse).toBe(
        'I encountered an error processing your request: rate limit exceeded'
      );
      expect(memoryService.saveMessage).toHaveBeenCalledWith(
        'conv-1',
        'assistant',
        'I encountered an error processing your request: rate limit exceeded'
      );
    });

    it('does not let a title-generation failure affect the chat result', async () => {
      aiService.chatCompletion
        .mockResolvedValueOnce(makeAiResponse({ content: 'main response' }))
        .mockRejectedValueOnce(new Error('title generation failed'));

      const result = await target.chat('user-1', null, 'hello');

      expect(result.finalResponse).toBe('main response');
      expect(agentsRepository.updateConversationTitle).not.toHaveBeenCalled();
    });
  });

  describe('listConversations', () => {
    it('delegates to the repository and returns its result', async () => {
      const expected = { data: [makeConversationRow()], total: 1 };
      agentsRepository.findConversationsByUserId.mockResolvedValue(expected);

      const result = await target.listConversations('user-1', 1, 20);

      expect(result).toBe(expected);
      expect(agentsRepository.findConversationsByUserId).toHaveBeenCalledWith('user-1', 1, 20);
    });
  });

  describe('getConversation', () => {
    it('delegates to the memory service', async () => {
      const memory = {
        conversationId: 'conv-1',
        userId: 'user-1',
        title: null,
        model: 'gpt-4o',
        systemPrompt: null,
        messages: [],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      memoryService.loadConversation.mockResolvedValue(memory);

      const result = await target.getConversation('conv-1');

      expect(result).toBe(memory);
    });

    it('returns null when the conversation does not exist', async () => {
      memoryService.loadConversation.mockResolvedValue(null);

      const result = await target.getConversation('missing');

      expect(result).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('delegates to the repository', async () => {
      await target.deleteConversation('conv-1');

      expect(agentsRepository.deleteConversation).toHaveBeenCalledWith('conv-1');
    });
  });
});
