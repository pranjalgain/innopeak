const fs = require('fs');
const path = require('path');

const migrationName = process.argv[2];
if (!migrationName) {
  console.error('Usage: node scripts/create-migration.js <migration_name>');
  process.exit(1);
}

const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'drizzle', 'migrations');
const metaDir = path.join(migrationsDir, 'meta');

// Read existing journal
const journalPath = path.join(metaDir, '_journal.json');
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
const nextIdx = journal.entries.length;
const tag = `${String(nextIdx).padStart(4, '0')}_${migrationName}`;

// Create empty SQL file
const sqlPath = path.join(migrationsDir, `${tag}.sql`);
fs.writeFileSync(sqlPath, `-- Migration: ${migrationName}\n-- Created at: ${new Date().toISOString()}\n\n`);

// Create snapshot
const snapshotPath = path.join(metaDir, `${String(nextIdx).padStart(4, '0')}_snapshot.json`);
const prevId = nextIdx > 0 ? journal.entries[nextIdx - 1].tag : '';
fs.writeFileSync(snapshotPath, JSON.stringify({
  id: `00000000-0000-0000-0000-${String(nextIdx).padStart(12, '0')}`,
  prevId: prevId ? `00000000-0000-0000-0000-${String(nextIdx - 1).padStart(12, '0')}` : '',
  version: '7',
  dialect: 'postgresql',
  tables: {},
  enums: {},
  schemas: {},
  _meta: { schemas: {}, tables: {}, columns: {} }
}, null, 2));

// Update journal
journal.entries.push({
  idx: nextIdx,
  version: '7',
  when: Date.now(),
  tag,
  breakpoints: true,
});
fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));

console.log(`Created migration: ${sqlPath}`);
console.log(`Updated journal with tag: ${tag}`);
