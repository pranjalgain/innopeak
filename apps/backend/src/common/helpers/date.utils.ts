/**
 * Normalises a timestamp a repository read back from Postgres into an ISO-8601 string.
 *
 * Drizzle's `timestamp({ mode: 'string' })` columns hand back Postgres' own text rendering
 * verbatim — `2026-09-11 11:00:20.346998+00`: a space instead of `T`, microsecond precision, and a
 * `+00` offset with no minutes. That is a perfectly valid timestamp and an invalid ISO-8601 one,
 * which matters because every consumer of these DTOs feeds them to `new Date(...)`. V8 happens to
 * parse the non-standard shape, so it works in Chrome and in Node (and therefore in tests); Safari
 * and Firefox return `Invalid Date` for it, rendering "NaN" or throwing on `toLocaleDateString`.
 *
 * `mode: 'date'` on the schema columns would avoid this at the source, but these are cross-cutting
 * admin reads over tables whose other consumers already expect strings — converting at the DTO
 * boundary changes only the API contract, which is the thing that was wrong.
 *
 * An unparseable value is returned unchanged rather than becoming `"Invalid Date"`: a DTO is the
 * wrong layer to fail a request over a display format, and an odd-looking string in the response
 * is far easier to trace back than a silently substituted placeholder.
 */
export function toIsoString(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** `toIsoString` for a nullable column — `null` passes straight through. */
export function toIsoStringOrNull(value: string | null): string | null {
  return value === null ? null : toIsoString(value);
}
