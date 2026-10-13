/** The single canonical locale list; the switcher, `request.ts` and `messages/*.json` are driven off it. Matches the backend `Locale` enum and the Docusaurus `locales` array 1:1. */
export const SUPPORTED_LOCALES = ["en", "de"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** Cookie-only locale storage (no `[locale]` route segment); `NEXT_LOCALE` is next-intl's name for this setup, shared so `request.ts` and the switcher cannot drift. */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
