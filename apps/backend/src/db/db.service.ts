import { EnvConfig } from '@config/env.config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './drizzle/schema';

export type DrizzleDB = NodePgDatabase<typeof schema>;

// Derived from `transaction`'s callback: a transaction is a structurally narrower type than `DrizzleDB`.
export type DrizzleTransaction = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

/**
 * Must be a `Pool`, not a single `Client`: Drizzle only isolates `db.transaction(...)` when it can
 * check out a dedicated connection (`NodePgSession.transaction`'s `isPool` branch). On a bare
 * `Client`, concurrent transactions interleave BEGIN/COMMIT on one session and one request's
 * rollback can discard another's writes.
 */
@Injectable()
export class DBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DBService.name);
  /**
   * Exposed for session-level advisory locks held across several transactions: acquire and
   * release must share one physical connection, or the unlock silently no-ops on another pooled
   * session. Callers `pool.connect()` their own client (see `AuthRepository.runWithErasurePurgeLock`).
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
      // A `Pool` doesn't connect eagerly; without this, an unreachable DATABASE_URL would still log
      // success and fail later on some unrelated request's first query.
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
