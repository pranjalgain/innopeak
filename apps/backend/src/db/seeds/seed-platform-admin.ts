import 'dotenv/config';
import { BcryptService } from '@common/hashing/bcrypt.service';
import { Client } from 'pg';

/* eslint-disable no-console -- standalone CLI script, no Nest Logger/DI context available */

/**
 * Creates the root platform admin — the one identity with no other creation path. Every later
 * admin is invited by an existing one (`AdminSettingsService.sendInvite`), so without this there
 * is no way into the Super Admin area at all on a fresh database.
 *
 * This is deliberately a **seed script, not a migration**. It used to be an `INSERT` inside
 * `0008_dev_platform_admin.sql`, which meant a bcrypt hash of a password written in plain text in
 * that same file's comments was committed to git and, because the migration is journaled and
 * `migrate.ts` has no environment guard, applied to *every* database `pnpm db:migrate` ever
 * touched — production included. The file argued that was survivable because nothing could mint a
 * `platform_admin` JWT yet; that stopped being true once admin login shipped, at which point the
 * committed credential was a working root login on every deployment.
 *
 * Migrations are for schema. A credential has to come from the environment, which SQL cannot read
 * — hence a script.
 *
 * Idempotent: if a root admin already exists it makes no change and exits 0, so re-running it (or
 * leaving it in `local:up`) is safe. It deliberately does *not* update an existing root's
 * password — rotating a live admin credential should be a conscious act, not a side effect of
 * running setup.
 */

/** Long enough that a seeded root is not the weakest link; deliberately stricter than signup's. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * The shipped `.env.example` value. Deliberately not a usable password (unlike `JWT_SECRET`'s
 * local-dev default) — there is no reason to ever actually run with it, so it is refused outright
 * rather than merely warned about. This is what stands in for the credential that used to be
 * committed in plain text in migration 0008: this script exists specifically so no root admin
 * password can ever again be a fixed value read straight out of a public file.
 */
const PLACEHOLDER_PASSWORD = 'change-this-before-first-run';

/**
 * `false` means "skip seeding, but this is not a failure" — distinct from the other validation
 * failures below, which are an operator actively trying to seed with a bad value and should fail
 * loudly. This one is the ordinary state of any `.env` that predates `ROOT_ADMIN_*`, which every
 * database migrated before this MR left every existing developer with. `local:up`/`local:dev:up`
 * chain this script before `start:dev` with `&&`, so exiting non-zero here didn't just skip
 * seeding — it silently aborted the whole `pnpm local:up` before the API server ever started, for
 * every developer who hadn't yet added the new variables. Skipping is safe: nothing downstream of
 * boot depends on a root admin existing (see `signup`, which is the one path that actually
 * creates a real account), and `pnpm db:seed:admin` can always be re-run by hand once someone
 * actually needs Super Admin access.
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
    // `idx_platform_admins_single_root` allows exactly one NULL-inviter row, so a second insert
    // would fail on the index rather than quietly adding a rival root. Checking first turns that
    // into a clean, readable no-op.
    const existing = await client.query<{ email: string }>(
      'SELECT email FROM platform_admins WHERE invited_by_platform_admin_id IS NULL LIMIT 1'
    );

    const rootRow = existing.rows[0];
    if (rootRow?.email === email) {
      console.log(`Root platform admin already exists (${rootRow.email}) — nothing to do.`);
      return true;
    }
    if (rootRow) {
      // Distinct from the case above on purpose: this is the state a database migrated before
      // ROOT_ADMIN_* existed is left in, including one seeded by the credential migration 0008
      // used to commit in plain text. Silently reporting "nothing to do" here previously let an
      // operator believe they had rotated onto a fresh credential when the old row — and its old
      // password — was still the one that could actually log in. This script never rotates an
      // existing root's credentials on its own, so surfacing the mismatch loudly is the only
      // signal the operator gets that manual action is still required.
      console.warn(
        `WARNING: a root platform admin already exists with email "${rootRow.email}", which ` +
          `does not match ROOT_ADMIN_EMAIL="${email}". Nothing was changed — the existing ` +
          `"${rootRow.email}" account (and its current password) is still the one that can log ` +
          `in. If "${rootRow.email}" is a leftover from before ROOT_ADMIN_* existed, rotate it ` +
          'explicitly (update its email/password_hash, or delete that row and re-run this script).'
      );
      return true;
    }

    // The app's own hashing service rather than a hardcoded hash or `password.utils`' cost of 10,
    // so the seeded credential can never be weaker than one set through the running app.
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
