interface PgErrorShape {
  code?: unknown;
  constraint?: unknown;
}

/**
 * Drizzle wraps driver errors in `DrizzleQueryError` and keeps the original `pg` `DatabaseError`
 * on `.cause`, so the Postgres SQLSTATE lives one (sometimes two) levels down. Walk the chain
 * rather than assuming a depth.
 */
function errorChain(error: unknown): PgErrorShape[] {
  const chain: PgErrorShape[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current !== null && typeof current === 'object'; depth++) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/** SQLSTATE 23505. For a unique *index* (not a named constraint) Postgres reports the index name as `constraint`. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return errorChain(error).some(
    e => e.code === '23505' && (constraint === undefined || e.constraint === constraint)
  );
}

/**
 * SQLSTATE 23514 — a CHECK constraint rejected the row.
 *
 * Every service-level guard that mirrors a CHECK is a read-then-write, so two concurrent requests
 * can both pass the guard and the second still trips the constraint. That is the constraint doing
 * its job; what the caller must not get is a raw 500 for an invariant the API already documents a
 * clean 4xx for.
 */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  return errorChain(error).some(
    e => e.code === '23514' && (constraint === undefined || e.constraint === constraint)
  );
}
