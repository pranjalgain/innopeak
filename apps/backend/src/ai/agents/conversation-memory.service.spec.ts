import type { AiService } from '@ai/ai.service';
import type { MessageRow } from '@db/repositories/ai/agents.repository';
import { AgentsRepository } from '@db/repositories/ai/agents.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ConversationMemoryService } from './conversation-memory.service';

describe('ConversationMemoryService', () => {
  let target: ConversationMemoryService;
  let agentsRepository: {
    findConversationById: jest.Mock;
    getMessages: jest.Mock;
    addMessage: jest.Mock;
  };

  const makeMessageRow = (overrides: Partial<MessageRow> = {}): MessageRow => ({
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: 'hello',
    toolCalls: null,
    tokenCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    agentsRepository = {
      findConversationById: jest.fn(),
      getMessages: jest.fn(),
      addMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationMemoryService,
        { provide: AgentsRepository, useValue: agentsRepository },
      ],
    }).compile();

    target = module.get(ConversationMemoryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('loadConversation', () => {
    it('returns the conversation memory with mapped messages when found', async () => {
      agentsRepository.findConversationById.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        title: 'Chat',
        model: 'gpt-4o',
        systemPrompt: 'be helpful',
        metadata: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      agentsRepository.getMessages.mockResolvedValue([
        makeMessageRow({ role: 'user', content: 'hi' }),
        makeMessageRow({ role: 'assistant', content: 'hello there' }),
      ]);

      const result = await target.loadConversation('conv-1');

      expect(result).toEqual({
        conversationId: 'conv-1',
        userId: 'user-1',
        title: 'Chat',
        model: 'gpt-4o',
        systemPrompt: 'be helpful',
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello there' },
        ],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      expect(agentsRepository.getMessages).toHaveBeenCalledWith('conv-1');
    });

    it('returns null when the conversation does not exist', async () => {
      agentsRepository.findConversationById.mockResolvedValue(null);

      const result = await target.loadConversation('missing-conv');

      expect(result).toBeNull();
      expect(agentsRepository.getMessages).not.toHaveBeenCalled();
    });
  });

  describe('saveMessage', () => {
    it('delegates to the repository with all provided fields', async () => {
      await target.saveMessage('conv-1', 'assistant', 'response text', [{ id: 't1' }], 42);

      expect(agentsRepository.addMessage).toHaveBeenCalledWith(
        'conv-1',
        'assistant',
        'response text',
        [{ id: 't1' }],
        42
      );
    });

    it('delegates to the repository when optional fields are omitted', async () => {
      await target.saveMessage('conv-1', 'user', 'hi');

      expect(agentsRepository.addMessage).toHaveBeenCalledWith(
        'conv-1',
        'user',
        'hi',
        undefined,
        undefined
      );
    });
  });

  describe('getRecentMessages', () => {
    it('returns an empty array when the conversation has no messages', async () => {
      agentsRepository.getMessages.mockResolvedValue([]);

      const result = await target.getRecentMessages('conv-1', 1000);

      expect(result).toEqual([]);
    });

    it('returns messages in chronological order within the token budget', async () => {
      agentsRepository.getMessages.mockResolvedValue([
        makeMessageRow({ id: '1', role: 'user', content: 'a'.repeat(10) }),
        makeMessageRow({ id: '2', role: 'assistant', content: 'b'.repeat(10) }),
      ]);

      const result = await target.getRecentMessages('conv-1', 1000);

      expect(result).toEqual([
        { role: 'user', content: 'a'.repeat(10) },
        { role: 'assistant', content: 'b'.repeat(10) },
      ]);
    });

    it('truncates older messages that exceed the estimated token budget', async () => {
      agentsRepository.getMessages.mockResolvedValue([
        makeMessageRow({ id: '1', role: 'user', content: 'x'.repeat(400) }),
        makeMessageRow({ id: '2', role: 'assistant', content: 'recent message' }),
      ]);

      // maxTokens small enough that only the most recent message fits.
      const result = await target.getRecentMessages('conv-1', 5);

      expect(result).toEqual([{ role: 'assistant', content: 'recent message' }]);
    });
  });

  describe('summarizeAndTruncate', () => {
    it('skips summarization when there are 10 or fewer messages', async () => {
      agentsRepository.getMessages.mockResolvedValue(
        Array.from({ length: 5 }, (_unused, i) => makeMessageRow({ id: `${i}` }))
      );
      const aiService = { chatCompletion: jest.fn() } as unknown as AiService;

      await target.summarizeAndTruncate('conv-1', aiService);

      expect(aiService.chatCompletion).not.toHaveBeenCalled();
      expect(agentsRepository.addMessage).not.toHaveBeenCalled();
    });

    it('summarizes and saves a system message when there are more than 10 messages', async () => {
      agentsRepository.getMessages.mockResolvedValue(
        Array.from({ length: 11 }, (_unused, i) =>
          makeMessageRow({ id: `${i}`, content: `message ${i}` })
        )
      );
      const chatCompletion = jest.fn().mockResolvedValue({
        data: { content: 'concise summary' },
      });
      const aiService = { chatCompletion } as unknown as AiService;

      await target.summarizeAndTruncate('conv-1', aiService);

      expect(chatCompletion).toHaveBeenCalledTimes(1);
      expect(agentsRepository.addMessage).toHaveBeenCalledWith(
        'conv-1',
        'system',
        '[Conversation Summary] concise summary'
      );
    });

    it('propagates errors from the AI service', async () => {
      agentsRepository.getMessages.mockResolvedValue(
        Array.from({ length: 11 }, (_unused, i) => makeMessageRow({ id: `${i}` }))
      );
      const aiService = {
        chatCompletion: jest.fn().mockRejectedValue(new Error('rate limited')),
      } as unknown as AiService;

      await expect(target.summarizeAndTruncate('conv-1', aiService)).rejects.toThrow(
        'rate limited'
      );
      expect(agentsRepository.addMessage).not.toHaveBeenCalled();
    });
  });
});
