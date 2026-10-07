/**
 * For `@Transform` before `@Length(1, …)`: otherwise `"   "` passes min-length and lands as a blank
 * name. Non-strings pass through so `@IsString` reports the error.
 */
export function trimStringInput(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
