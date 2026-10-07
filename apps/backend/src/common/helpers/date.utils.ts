/**
 * Normalises Postgres' text timestamps (`2026-09-11 11:00:20.346998+00`) to ISO-8601: V8 parses that shape,
 * but Safari/Firefox return `Invalid Date`. Done at the DTO boundary rather than `mode: 'date'` because other
 * consumers of these tables expect strings.
 * An unparseable value is returned unchanged: a DTO is the wrong layer to fail a request over a display format.
 */
export function toIsoString(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** `toIsoString` for a nullable column — `null` passes straight through. */
export function toIsoStringOrNull(value: string | null): string | null {
  return value === null ? null : toIsoString(value);
}
