import 'dotenv/config';
import { BcryptService } from '@common/hashing/bcrypt.service';
import { Client } from 'pg';

/* eslint-disable no-console -- standalone CLI script, no Nest Logger/DI context available */

/**
 * Creates the root platform admin, the one identity with no other creation path (later admins are invited by
 * an existing one).
 *
 * A seed script, not a migration: migrations are journaled and applied to every database `pnpm db:migrate`
 * touches (production included), and SQL cannot read a credential from the environment.
 *
 * Idempotent: an existing root is left unchanged and it exits 0. It deliberately never updates an existing
 * root's password; rotating a live admin credential should be a conscious act.
 */

/** Long enough that a seeded root is not the weakest link; deliberately stricter than signup's. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * The shipped `.env.example` value. Not a usable password: refused outright rather than warned about, so no
 * root admin password can be a fixed value read from a public file.
 */
const PLACEHOLDER_PASSWORD = 'change-this-before-first-run';

/**
 * `false` means skip seeding without failing: it is the ordinary state of a `.env` predating `ROOT_ADMIN_*`,
 * and `local:up` chains this script before `start:dev` with `&&`, so a non-zero exit would abort the whole
 * startup. Other validation failures are an operator seeding a bad value and fail loudly.
 */
async function seedPlatformAdmin(): Promise<boolean> {
  const email = process.env['ROOT_ADMIN_EMAIL']?.trim().toLowerCase();
  const password = process.env['ROOT_ADMIN_PASSWORD'];

  if (!email || !password) {
    console.warn(
      'Root admin not seeded: ROOT_ADMIN_EMAIL/ROOT_ADMIN_PASSWORD are not set. Skipping — set ' +
        'them and re-run `pnpm db:seed:admin` whenever Super Admin access is actually needed. ' +
        'For local development, .env.example ships values you can copy.'
    );
    return false;
  }

  if (password === PLACEHOLDER_PASSWORD) {
    console.error(
      'Refusing to seed the root platform admin with the shipped placeholder ' +
        'ROOT_ADMIN_PASSWORD. Set a real value in the environment first.'
    );
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`ROOT_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env['DATABASE_URL'] });
  await client.connect();

  try {
    // `idx_platform_admins_single_root` allows one NULL-inviter row; checking first turns a duplicate insert's index failure into a clean no-op.
    const existing = await client.query<{ email: string }>(
      'SELECT email FROM platform_admins WHERE invited_by_platform_admin_id IS NULL LIMIT 1'
    );

    const rootRow = existing.rows[0];
    if (rootRow?.email === email) {
      console.log(`Root platform admin already exists (${rootRow.email}) — nothing to do.`);
      return true;
    }
    if (rootRow) {
      // Not the case above: a database migrated before ROOT_ADMIN_* (including one seeded by the old
      // plaintext-credential migration) keeps its old root, whose old password still logs in. This script never
      // rotates it, so warn loudly that manual action is required.
      console.warn(
        `WARNING: a root platform admin already exists with email "${rootRow.email}", which ` +
          `does not match ROOT_ADMIN_EMAIL="${email}". Nothing was changed — the existing ` +
          `"${rootRow.email}" account (and its current password) is still the one that can log ` +
          `in. If "${rootRow.email}" is a leftover from before ROOT_ADMIN_* existed, rotate it ` +
          'explicitly (update its email/password_hash, or delete that row and re-run this script).'
      );
      return true;
    }

    // The app's own hashing service, so the seeded credential is never weaker than one set through the running app.
    const passwordHash = await new BcryptService().hash(password);

    await client.query(
      `INSERT INTO platform_admins (email, password_hash, invited_by_platform_admin_id, status)
       VALUES ($1, $2, NULL, 'active')`,
      [email, passwordHash]
    );

    console.log(`Root platform admin created: ${email}`);
    return true;
  } finally {
    await client.end();
  }
}

seedPlatformAdmin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seeding the root platform admin failed:', err);
    process.exit(1);
  });
