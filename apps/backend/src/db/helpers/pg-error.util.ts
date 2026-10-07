interface PgErrorShape {
  code?: unknown;
  constraint?: unknown;
}

// Drizzle wraps driver errors and keeps the `pg` error on `.cause`, so the SQLSTATE is one or two levels down.
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

/** SQLSTATE 23514 (CHECK violation). Guards mirroring a CHECK are read-then-write, so a concurrent request can still trip it; callers map it to a 4xx, not a raw 500. */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  return errorChain(error).some(
    e => e.code === '23514' && (constraint === undefined || e.constraint === constraint)
  );
}
