import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { ConversationRow, MessageRow } from './agents.repository';
import { AgentsRepository } from './agents.repository';

/**
 * Builds a thenable Drizzle-like query-builder mock. Every chain method
 * (select/from/where/orderBy/limit/offset/insert/values/update/set/delete)
 * returns the same chain object so calls can be composed in any order the
 * repository uses, and awaiting the chain at any point resolves to `result`.
 * `.returning()` also resolves explicitly to `result`.
 */
function createChain<T>(result: T): PromiseLike<T> & Record<string, jest.Mock> {
  const methods = [
    'select',
    'from',
    'where',
    'orderBy',
    'limit',
    'offset',
    'insert',
    'values',
    'update',
    'set',
    'delete',
    '$dynamic',
  ];

  const chain: Record<string, jest.Mock> = {};
  methods.forEach(method => {
    chain[method] = jest.fn(() => chain);
  });
  chain['returning'] = jest.fn().mockResolvedValue(result);

  const thenable = chain as PromiseLike<T> & Record<string, jest.Mock>;
  thenable.then = ((onFulfilled, onRejected) =>
    Promise.resolve(result).then(onFulfilled, onRejected)) as PromiseLike<T>['then'];

  return thenable;
}

describe('AgentsRepository', () => {
  let target: AgentsRepository;
  let db: { select: jest.Mock; insert: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let dbService: { db: typeof db };

  const conversationRow: ConversationRow = {
    id: 'conv-1',
    userId: 'user-1',
    title: 'Chat',
    model: 'claude-sonnet',
    systemPrompt: null,
    metadata: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const messageRow: MessageRow = {
    id: 'msg-1',
    conversationId: 'conv-1',
    role: 'user',
    content: 'hello',
    toolCalls: null,
    tokenCount: 0,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    db = {
      select: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    dbService = { db };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsRepository, { provide: DBService, useValue: dbService }],
    }).compile();

    target = module.get(AgentsRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createConversation', () => {
    it('inserts a conversation and returns the created row', async () => {
      db.insert.mockReturnValue(createChain([conversationRow]));

      const result = await target.createConversation('user-1', 'claude-sonnet', 'Chat');

      expect(db.insert).toHaveBeenCalled();
      expect(result).toBe(conversationRow);
    });

    it('throws when the insert returns no row', async () => {
      db.insert.mockReturnValue(createChain([]));

      await expect(target.createConversation('user-1', 'claude-sonnet')).rejects.toThrow(
        'Failed to create conversation'
      );
    });
  });

  describe('findConversationById', () => {
    it('returns the conversation when found', async () => {
      db.select.mockReturnValue(createChain([conversationRow]));

      const result = await target.findConversationById('conv-1');

      expect(db.select).toHaveBeenCalled();
      expect(result).toBe(conversationRow);
    });

    it('returns null when no conversation matches', async () => {
      db.select.mockReturnValue(createChain([]));

      const result = await target.findConversationById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findConversationsByUserId', () => {
    it('returns paginated conversations with the total count', async () => {
      db.select
        .mockReturnValueOnce(createChain([{ count: 2 }]))
        .mockReturnValueOnce(createChain([conversationRow]));

      const result = await target.findConversationsByUserId('user-1', 1, 20);

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: [conversationRow], total: 2 });
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      db.select.mockReturnValueOnce(createChain([])).mockReturnValueOnce(createChain([]));

      const result = await target.findConversationsByUserId('user-1', 1, 20);

      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('updateConversationTitle', () => {
    it('updates the title and returns the updated row', async () => {
      const updated = { ...conversationRow, title: 'New title' };
      db.update.mockReturnValue(createChain([updated]));

      const result = await target.updateConversationTitle('conv-1', 'New title');

      expect(db.update).toHaveBeenCalled();
      expect(result).toBe(updated);
    });

    it('returns null when no matching conversation was updated', async () => {
      db.update.mockReturnValue(createChain([]));

      const result = await target.updateConversationTitle('missing', 'New title');

      expect(result).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('deletes the conversation by id', async () => {
      db.delete.mockReturnValue(createChain(undefined));

      await target.deleteConversation('conv-1');

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('addMessage', () => {
    it('inserts a message and touches the conversation updatedAt timestamp', async () => {
      db.insert.mockReturnValue(createChain([messageRow]));
      db.update.mockReturnValue(createChain(undefined));

      const result = await target.addMessage('conv-1', 'user', 'hello', undefined, 5);

      expect(db.insert).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(result).toBe(messageRow);
    });

    it('throws when the insert returns no row', async () => {
      db.insert.mockReturnValue(createChain([]));

      await expect(target.addMessage('conv-1', 'user', 'hello')).rejects.toThrow(
        'Failed to add message'
      );
    });
  });

  describe('getMessages', () => {
    it('returns all messages ordered by creation time when no limit is given', async () => {
      const chain = createChain([messageRow]);
      db.select.mockReturnValue(chain);

      const result = await target.getMessages('conv-1');

      expect(db.select).toHaveBeenCalled();
      expect(chain['$dynamic']).toHaveBeenCalled();
      expect(chain['limit']).not.toHaveBeenCalled();
      expect(result).toEqual([messageRow]);
    });

    it('applies a limit when provided', async () => {
      const chain = createChain([messageRow]);
      db.select.mockReturnValue(chain);

      const result = await target.getMessages('conv-1', 10);

      expect(chain['limit']).toHaveBeenCalledWith(10);
      expect(result).toEqual([messageRow]);
    });
  });
});
