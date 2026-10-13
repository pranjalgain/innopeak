#!/usr/bin/env node
/**
 * Guards the "applied migrations are immutable" rule that a live database needs.
 *
 * `migrations.lock.json` (next to the SQL files) records the SHA-256 of every migration that has shipped. Drizzle's migrator
 * walks `meta/_journal.json` and never re-reads a file it has applied, so editing an applied `.sql` is a silent no-op on every
 * existing database: `db:migrate` reports success and the change simply never arrives. That was harmless while only disposable
 * local databases existed; against production it means schema drift nobody sees.
 *
 *   node scripts/migrations-lock.js           verify: fail if a locked migration changed or disappeared, or the journal lost an entry.
 *                                             Migrations not in the lock yet are new and allowed (listed for information).
 *   node scripts/migrations-lock.js --write   (re)write the lock from the files on disk. Run it deliberately: when cutting a release
 *                                             (everything applied so far becomes immutable), or while no database exists beyond
 *                                             disposable local ones.
 *
 * To change the schema of something already locked, add a new numbered migration (`pnpm db:create-migration <name>`) with the ALTER.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'db', 'drizzle', 'migrations');
const lockPath = path.join(dir, 'migrations.lock.json');
const journalPath = path.join(dir, 'meta', '_journal.json');

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function current() {
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const files = {};
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    files[name] = sha256(path.join(dir, name));
  }
  return { journalTags: journal.entries.map(e => e.tag), files };
}

const now = current();

if (process.argv.includes('--write')) {
  fs.writeFileSync(lockPath, `${JSON.stringify({ journalTags: now.journalTags, files: now.files }, null, 2)}\n`);
  console.log(`Locked ${Object.keys(now.files).length} migrations in ${path.relative(process.cwd(), lockPath)}.`);
  process.exit(0);
}

if (!fs.existsSync(lockPath)) {
  console.error('No migrations.lock.json. Run `pnpm db:migrations:lock` to create it.');
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const problems = [];

for (const [name, hash] of Object.entries(lock.files)) {
  if (!(name in now.files)) problems.push(`${name} was locked but no longer exists.`);
  else if (now.files[name] !== hash) {
    problems.push(`${name} changed after it was locked. Revert it and put the change in a new numbered migration.`);
  }
}
for (const tag of lock.journalTags) {
  if (!now.journalTags.includes(tag)) problems.push(`meta/_journal.json lost the entry for ${tag}.`);
}

const added = Object.keys(now.files).filter(name => !(name in lock.files));
if (added.length > 0) console.log(`New (unlocked) migrations: ${added.join(', ')}`);

if (problems.length > 0) {
  console.error(`Migration check failed:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log(`OK: ${Object.keys(lock.files).length} locked migrations unchanged.`);
