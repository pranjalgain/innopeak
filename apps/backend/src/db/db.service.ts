import { EnvConfig } from '@config/env.config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './drizzle/schema';

export type DrizzleDB = NodePgDatabase<typeof schema>;

/**
 * The handle a repository method receives inside `dbService.db.transaction(async (tx) => ...)`.
 * Derived from `transaction`'s own callback parameter rather than reusing `DrizzleDB`, since a
 * transaction is a distinct (structurally narrower) generic instantiation in Drizzle's types.
 */
export type DrizzleTransaction = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

/**
 * Backed by a `Pool`, not a single `Client` — load-bearing, not a style choice. Drizzle's
 * node-postgres session only isolates `db.transaction(...)` calls when the underlying handle is a
 * `Pool`: it checks out a dedicated connection for the transaction's lifetime and releases it on
 * commit/rollback (see `NodePgSession.transaction`'s `isPool` branch in
 * `drizzle-orm/node-postgres/session.js`). Against a bare `Client`, every call reuses the same one
 * physical connection, so two concurrent `db.transaction(...)` calls (from two different requests)
 * interleave their `BEGIN`/`COMMIT` on that single session — one request's rollback can silently
 * discard another's already-"returned" writes. A single-connection `DBService` went unnoticed only
 * because nothing called `db.transaction(...)` before `AuthRepository.transaction()`.
 */
@Injectable()
export class DBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DBService.name);
  /**
   * Exposed (not `private`) for the one case `db`/`db.transaction()` can't cover: a session-level
   * advisory lock (`pg_advisory_lock`/`pg_advisory_unlock`, not `_xact_lock`) held across several
   * independent transactions. Every other `db.execute()`/`db.transaction()` call checks out an
   * arbitrary connection from this pool per call — fine for a single statement or one bounded
   * transaction, but a session lock's acquire and release must run on the exact same physical
   * connection, or the unlock can silently no-op on a different session while the lock stays held
   * on the first one until that pooled connection eventually closes. A caller needing this checks
   * out its own client via `pool.connect()`, keeps it for the lock's whole lifetime, and releases
   * it back when done — see `AuthRepository.runWithErasurePurgeLock`.
   */
  readonly pool: Pool;
  private _db!: DrizzleDB;

  constructor(config: ConfigService<EnvConfig>) {
    const databaseUrl = config.get<string>('DATABASE_URL') ?? '';
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  get db(): DrizzleDB {
    return this._db;
  }

  async onModuleInit(): Promise<void> {
    try {
      // Confirms the pool can actually reach Postgres before declaring success — a `Pool`
      // doesn't eagerly connect the way the old single `Client` did, so without this check-and-
      // release, "Database connected successfully" would log unconditionally even against an
      // unreachable DATABASE_URL, with the first real failure surfacing later on some unrelated
      // request's first query instead of at boot.
      const client = await this.pool.connect();
      client.release();

      this._db = drizzle(this.pool, { schema });
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Database connection failed:', (error as Error).message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.pool.end();
      this.logger.log('Database connection closed');
    } catch (error) {
      this.logger.error('Error disconnecting from database:', (error as Error).message);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
