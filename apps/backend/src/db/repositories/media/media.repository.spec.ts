import { DBService } from '@db/db.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { MediaRepository } from './media.repository';

/**
 * Builds a chainable, thenable mock query builder that mimics Drizzle's
 * fluent API (insert/select/delete ... .from/.where/.orderBy/.limit/.offset
 * /.values/.returning). Every chain method returns the same object so calls
 * can be chained arbitrarily, and awaiting the object at any point resolves
 * to `finalValue` via the custom `then` implementation.
 */
function createQueryChain<T>(finalValue: T): PromiseLike<T> & Record<string, jest.Mock> {
  const chainMethods = ['from', 'where', 'orderBy', 'limit', 'offset', 'values', 'returning'];

  const chain: Record<string, unknown> = {};

  for (const method of chainMethods) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }

  chain['then'] = (
    onfulfilled?: (value: T) => unknown,
    onrejected?: (reason: unknown) => unknown
  ): Promise<unknown> => Promise.resolve(finalValue).then(onfulfilled, onrejected);

  return chain as PromiseLike<T> & Record<string, jest.Mock>;
}

const mockRow = {
  id: 'media-id-1',
  userId: 'user-id-1',
  filename: 'media/2026/07/uuid-file.png',
  originalName: 'file.png',
  mimeType: 'image/png',
  size: '1024',
  storageProvider: 's3',
  storageKey: 'media/2026/07/uuid-file.png',
  url: 'https://example.com/file.png',
  thumbnailUrl: null,
  metadata: { foo: 'bar' },
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

describe('MediaRepository', () => {
  let target: MediaRepository;
  let dbService: { db: { insert: jest.Mock; select: jest.Mock; delete: jest.Mock } };

  beforeEach(async () => {
    dbService = {
      db: {
        insert: jest.fn(),
        select: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaRepository, { provide: DBService, useValue: dbService }],
    }).compile();

    target = module.get(MediaRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('inserts a media record and maps the returned row', async () => {
      dbService.db.insert.mockReturnValue(createQueryChain([mockRow]));

      const result = await target.create({
        userId: mockRow.userId,
        filename: mockRow.filename,
        originalName: mockRow.originalName,
        mimeType: mockRow.mimeType,
        size: mockRow.size,
        storageProvider: mockRow.storageProvider,
        storageKey: mockRow.storageKey,
        url: mockRow.url,
        thumbnailUrl: mockRow.thumbnailUrl,
        metadata: mockRow.metadata,
      });

      expect(dbService.db.insert).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: mockRow.id,
        userId: mockRow.userId,
        filename: mockRow.filename,
        originalName: mockRow.originalName,
        mimeType: mockRow.mimeType,
        size: mockRow.size,
        storageProvider: mockRow.storageProvider,
        storageKey: mockRow.storageKey,
        url: mockRow.url,
        thumbnailUrl: mockRow.thumbnailUrl,
        metadata: mockRow.metadata,
        createdAt: mockRow.createdAt,
      });
    });

    it('throws when the insert returns no row', async () => {
      dbService.db.insert.mockReturnValue(createQueryChain([]));

      await expect(
        target.create({
          userId: mockRow.userId,
          filename: mockRow.filename,
          originalName: mockRow.originalName,
          mimeType: mockRow.mimeType,
          size: mockRow.size,
          storageProvider: mockRow.storageProvider,
          storageKey: mockRow.storageKey,
          url: mockRow.url,
          thumbnailUrl: mockRow.thumbnailUrl,
          metadata: mockRow.metadata,
        })
      ).rejects.toThrow('Failed to insert media record');
    });
  });

  describe('findById', () => {
    it('returns the mapped media file when found', async () => {
      dbService.db.select.mockReturnValue(createQueryChain([mockRow]));

      const result = await target.findById(mockRow.id);

      expect(dbService.db.select).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({ id: mockRow.id, storageKey: mockRow.storageKey })
      );
    });

    it('returns null when no row is found', async () => {
      dbService.db.select.mockReturnValue(createQueryChain([]));

      const result = await target.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns paginated data and total count', async () => {
      dbService.db.select
        .mockReturnValueOnce(createQueryChain([{ count: 2 }]))
        .mockReturnValueOnce(createQueryChain([mockRow, { ...mockRow, id: 'media-id-2' }]));

      const result = await target.findByUserId(mockRow.userId, 1, 20);

      expect(dbService.db.select).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual(expect.objectContaining({ id: mockRow.id }));
    });

    it('defaults total to 0 when the count query returns no rows', async () => {
      dbService.db.select
        .mockReturnValueOnce(createQueryChain([]))
        .mockReturnValueOnce(createQueryChain([]));

      const result = await target.findByUserId(mockRow.userId, 1, 20);

      expect(result.total).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes the media record by id', async () => {
      dbService.db.delete.mockReturnValue(createQueryChain(undefined));

      await target.delete(mockRow.id);

      expect(dbService.db.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByIds', () => {
    it('returns an empty array without querying when ids is empty', async () => {
      const result = await target.findByIds([]);

      expect(result).toEqual([]);
      expect(dbService.db.select).not.toHaveBeenCalled();
    });

    it('returns mapped media files for the given ids', async () => {
      dbService.db.select.mockReturnValue(createQueryChain([mockRow]));

      const result = await target.findByIds([mockRow.id]);

      expect(dbService.db.select).toHaveBeenCalledTimes(1);
      expect(result).toEqual([expect.objectContaining({ id: mockRow.id })]);
    });
  });
});
