import type { DBService } from '@db/db.service';

import { AuthRepository } from './auth.repository';

/** A session advisory lock lives on the connection; one that could not be released must not be handed back to the pool still holding it. */
describe('AuthRepository.runWithErasurePurgeLock', () => {
  let query: jest.Mock;
  let release: jest.Mock;
  let repo: AuthRepository;

  /** Every unlock query fails, as on a connection that dropped. */
  const failUnlocks = (only?: (params: unknown[] | undefined) => boolean): void => {
    query.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes('pg_advisory_unlock') && (only === undefined || only(params))) {
        return Promise.reject(new Error('connection reset'));
      }
      return Promise.resolve({ rows: [] });
    });
  };

  beforeEach(() => {
    query = jest.fn().mockResolvedValue({ rows: [] });
    release = jest.fn();
    const pool = { connect: jest.fn().mockResolvedValue({ query, release }) };
    repo = new AuthRepository({ pool } as unknown as DBService);
  });

  it('hands the connection back normally when every lock released', async () => {
    await expect(repo.runWithErasurePurgeLock(() => Promise.resolve('done'))).resolves.toBe('done');

    expect(release).toHaveBeenCalledWith(false);
  });

  it('destroys the connection when the global unlock fails, and still returns the work’s result', async () => {
    failUnlocks();

    await expect(repo.runWithErasurePurgeLock(() => Promise.resolve('done'))).resolves.toBe('done');

    expect(release).toHaveBeenCalledWith(true);
  });

  it('destroys the connection when a per-resource unlock fails', async () => {
    failUnlocks(params => params?.length === 2);

    await repo.runWithErasurePurgeLock(acquireLock =>
      acquireLock('gdpr:tenant-erasure', 't-1', () => Promise.resolve(undefined))
    );

    expect(release).toHaveBeenCalledWith(true);
  });

  it('does not let a failed unlock hide the work’s own failure', async () => {
    failUnlocks();

    await expect(
      repo.runWithErasurePurgeLock(() => Promise.reject(new Error('the purge failed')))
    ).rejects.toThrow('the purge failed');
    expect(release).toHaveBeenCalledWith(true);
  });
});
