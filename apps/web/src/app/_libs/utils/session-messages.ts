import { type AppLocale, DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/i18n/locales";

type SessionMessageKind = "expired" | "refreshFailed";

const MESSAGES: Record<AppLocale, Record<SessionMessageKind, string>> = {
  en: {
    expired: "Your session has expired. Please sign in again.",
    refreshFailed: "Could not refresh your session. Please try again.",
  },
  de: {
    expired: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
    refreshFailed: "Ihre Sitzung konnte nicht erneuert werden. Bitte versuchen Sie es erneut.",
  },
};

function currentLocale(): AppLocale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]*)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Text for the session errors raised below React (the axios interceptor, a service): there is no `useTranslations` there, and an English
 * sentence reached German users wherever a caller shows an error's own message. Read from the same `NEXT_LOCALE` cookie the app uses.
 */
export function sessionMessage(kind: SessionMessageKind): string {
  return MESSAGES[currentLocale()][kind];
}
