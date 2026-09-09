/**
 * One formatter per locale, built on first use. `Intl.RelativeTimeFormat` construction is the
 * expensive part, so caching matters when this runs once per notification in a list — but it
 * can no longer be a single module-level constant, because the locale is only known per render
 * now that the app is bilingual (it was hardcoded to "en-US", which rendered "3 hours ago" to
 * a German reader).
 */
const FORMATTER_BY_LOCALE = new Map<string, Intl.RelativeTimeFormat>();

function formatterFor(locale: string): Intl.RelativeTimeFormat {
  const cached = FORMATTER_BY_LOCALE.get(locale);
  if (cached) return cached;

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  FORMATTER_BY_LOCALE.set(locale, formatter);
  return formatter;
}

const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 31536000 },
  { unit: "month", seconds: 2592000 },
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
];

/**
 * Formats an ISO timestamp as "2 hours ago"/"3 days ago" (or "vor 2 Stunden"/"vor 3 Tagen")
 * relative to `now`. `locale` is required rather than defaulted: a default would silently
 * reintroduce the hardcoded-English bug at the next call site that forgets it. Callers in
 * components get it from next-intl's `useLocale()`.
 */
export function formatRelativeTime(isoDate: string, locale: string, now: Date = new Date()): string {
  const formatter = formatterFor(locale);
  const diffSeconds = (new Date(isoDate).getTime() - now.getTime()) / 1000;

  for (const { unit, seconds } of UNITS) {
    if (Math.abs(diffSeconds) >= seconds) {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return formatter.format(Math.round(diffSeconds / 1), "second");
}
