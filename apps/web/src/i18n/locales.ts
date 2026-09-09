/**
 * The single canonical locale list — everything else (the switcher, `request.ts`'s
 * negotiation, the `messages/*.json` files) is driven off this, so "en"/"de" is
 * declared exactly once. Matches the backend's `Locale` enum and the Docusaurus
 * `locales` array 1:1 — see apps/documentation/docs/meta/multilingual.md.
 */
export const SUPPORTED_LOCALES = ["en", "de"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/**
 * Cookie-only locale storage — no `[locale]` route segment. `NEXT_LOCALE` is the name
 * next-intl's own docs use for this exact "no routing" setup, kept here rather than
 * inline so `request.ts` and the switcher can't drift on the name.
 */
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  de: "Deutsch",
};

export function isSupportedLocale(value: string | undefined | null): value is AppLocale {
  return value != null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
