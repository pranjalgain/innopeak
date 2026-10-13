import { EnvConfig } from '@config/env.config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';

import * as schema from './drizzle/schema';

export type DrizzleDB = NodePgDatabase<typeof schema>;

// Derived from `transaction`'s callback: a transaction is a structurally narrower type than `DrizzleDB`.
export type DrizzleTransaction = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

/**
 * Pool settings from the environment, each with a production-sane default. `pg`'s own defaults are a 10-connection pool, no connect
 * timeout (a dead database makes every request hang) and no statement timeout (one runaway query holds a connection forever).
 */
export function buildPoolConfig(config: ConfigService<EnvConfig>): PoolConfig {
  const number = (key: keyof EnvConfig, fallback: number): number =>
    config.get<number>(key) ?? fallback;
  const ssl = config.get<string>('DB_SSL') === 'true';

  return {
    connectionString: config.get<string>('DATABASE_URL') ?? '',
    max: number('DB_POOL_MAX', 10),
    idleTimeoutMillis: number('DB_IDLE_TIMEOUT_MS', 30_000),
    connectionTimeoutMillis: number('DB_CONNECTION_TIMEOUT_MS', 5_000),
    statement_timeout: number('DB_STATEMENT_TIMEOUT_MS', 30_000),
    application_name: 'innopeak',
    // Certificate verification stays on unless explicitly relaxed (a managed database with a private CA bundle you cannot mount).
    ...(ssl
      ? {
          ssl: { rejectUnauthorized: config.get<string>('DB_SSL_REJECT_UNAUTHORIZED') !== 'false' },
        }
      : {}),
  };
}

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
    this.pool = new Pool(buildPoolConfig(config));
    // An idle pooled connection can be dropped by the server or a network device. `pg` re-emits that as an `error` event on the
    // pool, and an unhandled `error` event takes the whole process down.
    this.pool.on('error', error => {
      this.logger.error(`Idle database connection failed: ${error.message}`);
    });
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
      // Fail fast: continuing leaves `db` undefined, so the process would pass for up while every query threw a TypeError. Crashing at
      // boot is what lets a rollout halt on a bad DATABASE_URL instead of replacing a working instance with a broken one.
      throw error;
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
