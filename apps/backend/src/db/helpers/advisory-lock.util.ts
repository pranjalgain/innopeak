import type { DrizzleTransaction } from '@db/db.service';
import { sql } from 'drizzle-orm';

/**
 * `pg_advisory_xact_lock(hashtext(lockKey), hashtext(resourceId))` — a transaction-scoped,
 * per-resource advisory lock, released automatically at commit/rollback. One shared helper for
 * every per-tenant/per-user xact lock in the GDPR erasure flows (`AdminBusinessesRepository.
 * cancelErasure`/`setStatus`, `AuthRepository.requestMemberRemoval`/`cancelMemberRemoval`) instead
 * of each call site hand-writing the same SQL template — a typo in the hashtext/parameter order
 * would otherwise silently produce a lock that never actually serializes per-resource, with
 * nothing to catch it except careful review.
 */
export async function acquireResourceXactLock(
  tx: DrizzleTransaction,
  lockKey: string,
  resourceId: string
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}), hashtext(${resourceId}))`
  );
}
