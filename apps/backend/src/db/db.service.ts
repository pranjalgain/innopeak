import { EnvConfig } from '@config/env.config';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';

import * as schema from './drizzle/schema';

export type DrizzleDB = NodePgDatabase<typeof schema>;

@Injectable()
export class DBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DBService.name);
  private readonly client: Client;
  private _db!: DrizzleDB;

  constructor(config: ConfigService<EnvConfig>) {
    const databaseUrl = config.get<string>('DATABASE_URL') ?? '';
    this.client = new Client({ connectionString: databaseUrl });
  }

  get db(): DrizzleDB {
    return this._db;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      this._db = drizzle(this.client, { schema });
      this.logger.log('Database connected successfully');

      this.client.on('notification', msg => {
        this.logger.debug(`Received notification on channel: ${msg.channel}`);
        if (msg.channel === 'password_updates') {
          this.logger.log('Received password update notification');
        }
      });

      await this.client.query('LISTEN password_updates');
    } catch (error) {
      this.logger.error('Database connection failed:', (error as Error).message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.end();
      this.logger.log('Database connection closed');
    } catch (error) {
      this.logger.error('Error disconnecting from database:', (error as Error).message);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
