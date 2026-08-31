import type { AuthUser } from '@auth/interfaces/auth-user.interface';
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AgentService } from './agent.service';
import { AgentsController } from './agents.controller';
import type { ChatRequestDto } from './dto/chat.dto';
import type { AgentResult } from './interfaces/agent.interface';

describe('AgentsController', () => {
  let target: AgentsController;
  let agentService: {
    chat: jest.Mock;
    listConversations: jest.Mock;
    getConversation: jest.Mock;
    deleteConversation: jest.Mock;
  };

  const user: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
  };

  const makeAgentResult = (overrides: Partial<AgentResult> = {}): AgentResult => ({
    turns: [],
    finalResponse: 'hi there',
    conversationId: 'conv-1',
    totalTokens: 10,
    ...overrides,
  });

  beforeEach(async () => {
    agentService = {
      chat: jest.fn(),
      listConversations: jest.fn(),
      getConversation: jest.fn(),
      deleteConversation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [{ provide: AgentService, useValue: agentService }],
    }).compile();

    target = module.get(AgentsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('chat', () => {
    it('delegates to the agent service with a resolved conversation id and returns its result', async () => {
      const expected = makeAgentResult();
      agentService.chat.mockResolvedValue(expected);
      const dto: ChatRequestDto = { message: 'hello' };

      const result = await target.chat(user, dto);

      expect(agentService.chat).toHaveBeenCalledWith('user-1', null, 'hello', {});
      expect(result).toBe(expected);
    });

    it('only forwards config fields that are actually provided on the dto', async () => {
      agentService.chat.mockResolvedValue(makeAgentResult());
      const dto: ChatRequestDto = {
        message: 'hello',
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        model: 'claude-sonnet-4-20250514',
        temperature: 0.5,
      };

      await target.chat(user, dto);

      expect(agentService.chat).toHaveBeenCalledWith(
        'user-1',
        '550e8400-e29b-41d4-a716-446655440000',
        'hello',
        { model: 'claude-sonnet-4-20250514', temperature: 0.5 }
      );
    });

    it('propagates errors from the agent service', async () => {
      agentService.chat.mockRejectedValue(new Error('provider unavailable'));

      await expect(target.chat(user, { message: 'hi' })).rejects.toThrow('provider unavailable');
    });
  });

  describe('listConversations', () => {
    it('maps repository rows and computes pagination meta', async () => {
      agentService.listConversations.mockResolvedValue({
        data: [
          {
            id: 'conv-1',
            userId: 'user-1',
            title: 'Chat',
            model: 'gpt-4o',
            systemPrompt: null,
            metadata: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
          },
        ],
        total: 21,
      });

      const result = await target.listConversations(user, 1, 20);

      expect(agentService.listConversations).toHaveBeenCalledWith('user-1', 1, 20);
      expect(result).toEqual({
        data: [
          {
            id: 'conv-1',
            title: 'Chat',
            model: 'gpt-4o',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
          },
        ],
        meta: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
      });
    });

    it('returns an empty list with zero total pages when the user has no conversations', async () => {
      agentService.listConversations.mockResolvedValue({ data: [], total: 0 });

      const result = await target.listConversations(user, 1, 20);

      expect(result.data).toEqual([]);
      expect(result.meta.totalPages).toBe(0);
    });
  });

  describe('getConversation', () => {
    it('returns the shaped conversation when found', async () => {
      agentService.getConversation.mockResolvedValue({
        conversationId: 'conv-1',
        userId: 'user-1',
        title: 'Chat',
        model: 'gpt-4o',
        systemPrompt: 'be helpful',
        messages: [{ role: 'user', content: 'hi' }],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      const result = await target.getConversation('conv-1', user);

      expect(result).toEqual({
        id: 'conv-1',
        title: 'Chat',
        model: 'gpt-4o',
        systemPrompt: 'be helpful',
        messages: [{ role: 'user', content: 'hi' }],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
    });

    it('throws NotFoundException when the conversation does not exist', async () => {
      agentService.getConversation.mockResolvedValue(null);

      await expect(target.getConversation('missing-id', user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteConversation', () => {
    it('deletes the conversation when it exists', async () => {
      agentService.getConversation.mockResolvedValue({
        conversationId: 'conv-1',
        userId: 'user-1',
        title: null,
        model: 'gpt-4o',
        systemPrompt: null,
        messages: [],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      await target.deleteConversation('conv-1', user);

      expect(agentService.deleteConversation).toHaveBeenCalledWith('conv-1');
    });

    it('throws NotFoundException and does not delete when the conversation is missing', async () => {
      agentService.getConversation.mockResolvedValue(null);

      await expect(target.deleteConversation('missing-id', user)).rejects.toThrow(
        NotFoundException
      );
      expect(agentService.deleteConversation).not.toHaveBeenCalled();
    });
  });
});
