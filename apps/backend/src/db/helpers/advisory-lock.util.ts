import type { DrizzleTransaction } from '@db/db.service';
import { sql } from 'drizzle-orm';

/** Shared so call sites don't hand-write the SQL: a hashtext/parameter-order typo would silently produce a lock that never serializes. Released at commit/rollback. */
export async function acquireResourceXactLock(
  tx: DrizzleTransaction,
  lockKey: string,
  resourceId: string
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}), hashtext(${resourceId}))`
  );
}
