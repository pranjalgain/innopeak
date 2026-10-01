/** `next-intl`'s `useFormatter().dateTime(date, DATE_FORMAT)` options for a short absolute date
 *  ("Jan 5, 2026") — the shape used anywhere a date reads as a fixed point in time rather than
 *  relative to now (see `formatRelativeTime` for that case). */
export const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;
