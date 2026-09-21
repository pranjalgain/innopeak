import { type AppLocale, LOCALE_COOKIE_NAME } from "@/i18n/locales";

/**
 * A year out — long enough that a real choice sticks, short enough that a locale we
 * later drop (there won't be a third, per multilingual.md, but never say never) isn't
 * pinned forever. `path=/` so it's read no matter which route issues the next request;
 * no `httpOnly` because it has to be written from the client (see `setLocaleCookie`) and
 * carries nothing sensitive — worst case a stale locale, not a security issue.
 */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Sets the `NEXT_LOCALE` cookie `src/i18n/request.ts` reads. Client-only — Server
 * Components can't write cookies outside a Server Action, and the switcher just needs
 * "make the next request pick this up," not a mutation with its own round trip.
 * Callers still need to re-render the server tree afterwards (`router.refresh()`) since
 * setting the cookie alone doesn't re-run `request.ts` for the current page.
 */
export function setLocaleCookie(locale: AppLocale): void {
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
