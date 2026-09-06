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
    chain.push(current as PgErrorShape);
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
