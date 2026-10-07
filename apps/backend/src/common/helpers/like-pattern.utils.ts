/** `%`, `_` and `\` are LIKE wildcards/escape, which a user's search term must not be interpreted as. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}
