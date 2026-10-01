/**
 * Postgres's `LIKE`/`ILIKE` treat `%` and `_` as wildcards and `\` as the escape character itself —
 * none of which a user-supplied search term should be interpreted as. Without this, searching for
 * something literally named "50% Off Dave" or "J_ne" matches an unrelated, much broader (or
 * narrower) set of rows than the literal substring the caller typed.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}
