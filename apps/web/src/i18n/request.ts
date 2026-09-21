import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { type AppLocale, DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/i18n/locales";

/**
 * Cookie-only locale resolution — no `[locale]` route segment, no next-intl routing
 * middleware. See apps/documentation/docs/meta/multilingual.md's "Web app" section for
 * why: the app is overwhelmingly an authenticated dashboard with no SEO stake, so a URL
 * segment would mean churn to every `typedRoutes`-typed link for very little return.
 *
 * **The one cost this does carry, stated plainly:** `cookies()` and `headers()` below are
 * Next.js dynamic APIs, and this config is reached from the root layout — so *every* route
 * renders per request, including the public marketing page, which can no longer be prebuilt
 * or served from the full-route cache. For the dashboard that changes nothing (it was always
 * per-user and dynamic). For the marketing page it is a real regression versus the static
 * HTML it used to emit, and it is the strongest argument for the deferred follow-up the
 * design doc describes: a `[locale]` prefix scoped to the `(public)` group only, which would
 * let that one page go back to being statically rendered per locale while the authenticated
 * app keeps this cookie. Accepted knowingly for now, not overlooked.
 *
 * Resolution order (first hit wins), matching the order documented for the backend:
 *   0. An explicitly requested locale — `getTranslations({ locale })` and friends pass one here
 *      (see `GetRequestConfigParams.locale`). Without honouring it, those calls silently return
 *      the *visitor's* locale instead of the one asked for, which looks like it works right up
 *      until the two differ — `SiteHeader` renders every locale's copy of its action labels to
 *      reserve their width, and got the same language twice. Deliberately validated rather than
 *      trusted: the parameter is a plain string, and an unsupported value would otherwise reach
 *      the `import()` below as a missing-module crash.
 *   1. The `NEXT_LOCALE` cookie — set by the language switcher (`LanguageSwitcher`).
 *   2. The request's `Accept-Language` header, negotiated against `SUPPORTED_LOCALES`.
 *   3. `DEFAULT_LOCALE` ("en").
 */
export default getRequestConfig(async ({ locale: requestedLocale }) => {
  const locale = isSupportedLocale(requestedLocale)
    ? requestedLocale
    : await resolveVisitorLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

/** Steps 1-3 of the order above — what to serve a visitor who hasn't been asked about. */
async function resolveVisitorLocale(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  return isSupportedLocale(cookieLocale) ? cookieLocale : await negotiateFromAcceptLanguage();
}

/**
 * Accept-Language looks like `"de-DE,de;q=0.9,en;q=0.8"` — comma-separated tags, each
 * optionally carrying a `;q=` weight (default 1). Only the first two characters of each
 * tag are compared: this app has no region-specific locales (see `locales.ts`), so
 * `de-DE` and `de-AT` both resolve to the same `de` messages.
 *
 * The `q` weight is parsed rather than assumed, for two reasons. Mainstream browsers do
 * send tags in descending preference order, so taking the first supported match would
 * usually work — but `q=0` specifically means "not acceptable" (RFC 9110 §12.4.2), so a
 * header like `de;q=0, en` is a client stating it does *not* want German. Reading in
 * document order and ignoring `q` would have returned exactly the language the caller
 * rejected. Sorting by weight also makes a non-browser client that sends out of order
 * (`de;q=0.2, en;q=0.9`) resolve correctly.
 */
async function negotiateFromAcceptLanguage(): Promise<AppLocale> {
  const headerList = await headers();
  const acceptLanguage = headerList.get("accept-language") ?? "";

  const candidates = acceptLanguage
    .split(",")
    .map((entry) => {
      const [tag, ...params] = entry.split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = qParam === undefined ? 1 : Number.parseFloat(qParam.slice(2));

      return {
        lang: tag?.trim().slice(0, 2).toLowerCase(),
        // A malformed weight is treated as "unspecified" (1) rather than dropping the tag,
        // matching how browsers tolerate junk in this header.
        quality: Number.isNaN(quality) ? 1 : quality,
      };
    })
    // `q=0` is an explicit rejection, not merely a low preference — drop those outright.
    .filter((candidate) => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { lang } of candidates) {
    if (isSupportedLocale(lang)) {
      return lang;
    }
  }

  return DEFAULT_LOCALE;
}
