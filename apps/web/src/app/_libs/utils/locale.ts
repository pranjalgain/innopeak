import { type AppLocale, LOCALE_COOKIE_NAME } from "@/i18n/locales";

/**
 * A year: long enough that a choice sticks, short enough that a dropped locale isn't pinned
 * forever. Not `httpOnly` because it is written from the client (`setLocaleCookie`) and carries
 * nothing sensitive.
 */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Sets the `NEXT_LOCALE` cookie read by `src/i18n/request.ts`. Client-only; callers must still
 * `router.refresh()` since the cookie alone doesn't re-run `request.ts` for the current page.
 */
export function setLocaleCookie(locale: AppLocale): void {
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
