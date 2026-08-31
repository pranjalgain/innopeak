import { DBService } from '@db/db.service';
import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { AgentTool } from '../interfaces/tool.interface';

/** SQL keywords that indicate a write operation. */
const WRITE_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'REPLACE',
  'MERGE',
] as const;

/** Maximum number of rows returned to prevent excessively large responses. */
const MAX_ROWS = 100;

/**
 * Built-in agent tool that executes **read-only** SQL queries.
 *
 * All write operations (INSERT, UPDATE, DELETE, etc.) are rejected
 * before reaching the database.
 */
@Injectable()
export class DatabaseTool implements AgentTool {
  private readonly logger = new Logger(DatabaseTool.name);

  readonly name = 'database_query';

  readonly description =
    'Execute a read-only SQL query against the application database. ' +
    'Only SELECT statements are allowed. INSERT, UPDATE, DELETE, and other ' +
    'write operations will be rejected.';

  readonly parameters: Record<string, unknown> = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The SQL SELECT query to execute',
      },
    },
    required: ['query'],
  };

  constructor(private readonly dbService: DBService) {}

  async execute(args: Record<string, unknown>): Promise<string> {
    const query = args['query'];
    if (typeof query !== 'string' || query.trim().length === 0) {
      return 'Error: "query" parameter is required and must be a non-empty string.';
    }

    // ── Safety: reject write operations ──────────────────────────────────
    const upperQuery = query.toUpperCase().trim();

    for (const keyword of WRITE_KEYWORDS) {
      // Check if the query starts with or contains the write keyword
      // as a standalone word (not part of a column name)
      const pattern = new RegExp(`(^|\\s|;)${keyword}(\\s|$|;)`, 'i');
      if (pattern.test(upperQuery)) {
        this.logger.warn(`Rejected write query attempt: ${query.slice(0, 100)}`);
        return `Error: Write operations are not allowed. Only SELECT queries are permitted. Detected "${keyword}" keyword.`;
      }
    }

    if (
      !upperQuery.startsWith('SELECT') &&
      !upperQuery.startsWith('WITH') &&
      !upperQuery.startsWith('EXPLAIN')
    ) {
      return 'Error: Only SELECT, WITH (CTE), and EXPLAIN queries are allowed.';
    }

    // ── Execute the query ────────────────────────────────────────────────
    try {
      const result = await this.dbService.db.execute(sql.raw(query));
      const rows = result.rows;

      if (rows.length === 0) {
        return 'Query returned no results.';
      }

      const truncated = rows.length > MAX_ROWS;
      const displayRows = truncated ? rows.slice(0, MAX_ROWS) : rows;

      const formatted = JSON.stringify(displayRows, null, 2);
      const suffix = truncated
        ? `\n\n[Showing first ${String(MAX_ROWS)} of ${String(rows.length)} rows]`
        : `\n\n[${String(rows.length)} row(s) returned]`;

      this.logger.debug(`Database query returned ${String(rows.length)} row(s)`);

      return formatted + suffix;
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Database query failed: ${message}`);
      return `Error executing query: ${message}`;
    }
  }
}
