import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { RagRepository } from './rag.repository';

/**
 * Builds a thenable Drizzle-like query-builder mock. Every chain method
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

describe('RagRepository', () => {
  let target: RagRepository;
  let db: { select: jest.Mock; insert: jest.Mock; delete: jest.Mock; execute: jest.Mock };
  let dbService: { db: typeof db };

  const documentRow = {
    id: 'doc-1',
    title: 'Title',
    source: 'source',
    content: 'full content',
    metadata: null,
    createdAt: new Date('2026-01-01'),
  };

  const chunkRow = {
    id: 'chunk-1',
    documentId: 'doc-1',
    content: 'chunk content',
    chunkIndex: 0,
    metadata: null,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    db = {
      select: jest.fn(),
      insert: jest.fn(),
      delete: jest.fn(),
      execute: jest.fn(),
    };
    dbService = { db };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RagRepository, { provide: DBService, useValue: dbService }],
    }).compile();

    target = module.get(RagRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createDocument', () => {
    it('inserts a document and returns the mapped record', async () => {
      db.insert.mockReturnValue(createChain([documentRow]));

      const result = await target.createDocument({ content: 'full content' });

      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'doc-1',
        title: 'Title',
        source: 'source',
        content: 'full content',
        metadata: null,
        createdAt: documentRow.createdAt,
      });
    });

    it('throws when the insert returns no row', async () => {
      db.insert.mockReturnValue(createChain([]));

      await expect(target.createDocument({ content: 'x' })).rejects.toThrow(
        'Failed to insert document'
      );
    });
  });

  describe('findDocumentById', () => {
    it('returns the mapped document when found', async () => {
      db.select.mockReturnValue(createChain([documentRow]));

      const result = await target.findDocumentById('doc-1');

      expect(result).toEqual(
        expect.objectContaining({ id: 'doc-1', title: 'Title', content: 'full content' })
      );
    });

    it('returns null when no document matches', async () => {
      db.select.mockReturnValue(createChain([]));

      const result = await target.findDocumentById('missing');

      expect(result).toBeNull();
    });
  });

  describe('deleteDocument', () => {
    it('deletes the document by id', async () => {
      db.delete.mockReturnValue(createChain(undefined));

      await target.deleteDocument('doc-1');

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('findDocuments', () => {
    it('returns paginated documents with the total count', async () => {
      db.select
        .mockReturnValueOnce(createChain([{ count: 3 }]))
        .mockReturnValueOnce(createChain([documentRow]));

      const result = await target.findDocuments(1, 20);

      expect(db.select).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(expect.objectContaining({ id: 'doc-1' }));
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      db.select.mockReturnValueOnce(createChain([])).mockReturnValueOnce(createChain([]));

      const result = await target.findDocuments(1, 20);

      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('createChunks', () => {
    it('returns an empty array without hitting the database when given no chunks', async () => {
      const result = await target.createChunks('doc-1', []);

      expect(result).toEqual([]);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('inserts chunk rows and returns the mapped records', async () => {
      db.insert.mockReturnValue(createChain([chunkRow]));

      const result = await target.createChunks('doc-1', [
        { content: 'chunk content', chunkIndex: 0 },
      ]);

      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual([
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          content: 'chunk content',
          chunkIndex: 0,
          metadata: null,
          createdAt: chunkRow.createdAt,
        },
      ]);
    });
  });

  describe('storeEmbedding', () => {
    it('executes a raw SQL update with the vector literal', async () => {
      db.execute.mockResolvedValue(undefined);

      await target.storeEmbedding('chunk-1', [0.1, 0.2, 0.3]);

      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('similaritySearch', () => {
    it('executes a raw SQL vector search and maps the joined rows', async () => {
      const row = {
        id: 'chunk-1',
        document_id: 'doc-1',
        content: 'chunk content',
        chunk_index: 0,
        metadata: null,
        created_at: new Date('2026-01-01'),
        score: 0.87,
        doc_id: 'doc-1',
        doc_title: 'Title',
        doc_source: 'source',
        doc_content: 'full content',
        doc_metadata: null,
        doc_created_at: new Date('2026-01-01'),
      };
      db.execute.mockResolvedValue({ rows: [row] });

      const result = await target.similaritySearch([0.1, 0.2, 0.3], 5, 0.5);

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        {
          chunk: {
            id: 'chunk-1',
            documentId: 'doc-1',
            content: 'chunk content',
            chunkIndex: 0,
            metadata: null,
            createdAt: row.created_at,
          },
          score: 0.87,
          document: {
            id: 'doc-1',
            title: 'Title',
            source: 'source',
            content: 'full content',
            metadata: null,
            createdAt: row.doc_created_at,
          },
        },
      ]);
    });

    it('returns an empty array when no rows match', async () => {
      db.execute.mockResolvedValue({ rows: [] });

      const result = await target.similaritySearch([0.1], 5);

      expect(result).toEqual([]);
    });
  });
});
