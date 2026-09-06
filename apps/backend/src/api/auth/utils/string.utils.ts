/**
 * For a class-transformer `@Transform` ahead of `@Length(1, …)` — without it, `"   "` passes a
 * min-length-1 check and lands in the DB as a blank name. Non-strings pass through untouched so
 * `@IsString` still reports the real error.
 */
export function trimStringInput(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
