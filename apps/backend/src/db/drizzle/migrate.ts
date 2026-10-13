import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

import path from 'node:path';

async function runMigrations(): Promise<void> {
  const client = new Client({
    connectionString: process.env['DATABASE_URL'],
  });

  await client.connect();
  const db = drizzle(client);

  // eslint-disable-next-line no-console -- standalone CLI script, no Nest Logger/DI context available
  console.log('Running migrations...');

  await migrate(db, {
    // Relative to this file, not the working directory: it resolves the same from `src/` (ts-node) and from the built `dist/`
    // (where the SQL is copied next to the compiled script), so the production image can migrate with plain `node`.
    migrationsFolder: path.join(__dirname, 'migrations'),
  });

  // eslint-disable-next-line no-console -- see above
  console.log('Migrations completed successfully.');
  await client.end();
  process.exit(0);
}

runMigrations().catch(err => {
  // eslint-disable-next-line no-console -- see above
  console.error('Migration failed:', err);
  process.exit(1);
});
