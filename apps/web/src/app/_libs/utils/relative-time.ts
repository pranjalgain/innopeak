const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 31536000 },
  { unit: "month", seconds: 2592000 },
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
];

/** Formats an ISO timestamp as "2 hours ago"/"3 days ago" relative to `now`. */
export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const diffSeconds = (new Date(isoDate).getTime() - now.getTime()) / 1000;

  for (const { unit, seconds } of UNITS) {
    if (Math.abs(diffSeconds) >= seconds) {
      return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return RELATIVE_TIME_FORMATTER.format(Math.round(diffSeconds / 1), "second");
}
