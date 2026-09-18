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
// Highest existing idx + 1, deliberately not the entry count. The two agree only while the
// indices are gapless, and a gap is one removed migration away — 0008 was dropped and the rest
// renumbered to close exactly that. Counting entries would then hand back an index that already
// exists, and both writes below use writeFileSync, so the collision would silently truncate that
// migration's .sql and snapshot instead of failing.
const lastEntry = journal.entries.length > 0 ? journal.entries[journal.entries.length - 1] : null;
const nextIdx = journal.entries.reduce((max, entry) => Math.max(max, entry.idx), -1) + 1;
const tag = `${String(nextIdx).padStart(4, '0')}_${migrationName}`;

// Create empty SQL file
const sqlPath = path.join(migrationsDir, `${tag}.sql`);
fs.writeFileSync(sqlPath, `-- Migration: ${migrationName}\n-- Created at: ${new Date().toISOString()}\n\n`);

// Create snapshot
const snapshotPath = path.join(metaDir, `${String(nextIdx).padStart(4, '0')}_snapshot.json`);
// Also indexed off the last entry rather than `nextIdx - 1`, which with a gap in the indices
// points past the end of the array.
const prevId = lastEntry ? lastEntry.tag : '';
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
