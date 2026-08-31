import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

async function runMigrations(): Promise<void> {
  const client = new Client({
    connectionString: process.env['DATABASE_URL'],
  });

  await client.connect();
  const db = drizzle(client);

  // eslint-disable-next-line no-console -- standalone CLI script, no Nest Logger/DI context available
  console.log('Running migrations...');

  await migrate(db, {
    migrationsFolder: './src/db/drizzle/migrations',
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
