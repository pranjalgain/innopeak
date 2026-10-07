import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { type AppLocale, DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/i18n/locales";

/**
 * Cookie-only locale resolution: no `[locale]` segment or next-intl middleware, since the app is mostly an authenticated
 * dashboard with no SEO stake. Cost: `cookies()`/`headers()` make every route render per request, including the public
 * marketing page, which can no longer be statically prerendered.
 *
 * Resolution order (first hit wins):
 *   0. An explicit `getTranslations({ locale })` request, validated because the param is a plain string and an unsupported
 *      value would crash the `import()` below; ignoring it returns the visitor's locale (`SiteHeader` got the same language twice).
 *   1. The `NEXT_LOCALE` cookie set by `LanguageSwitcher`.
 *   2. `Accept-Language`, negotiated against `SUPPORTED_LOCALES`.
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

async function resolveVisitorLocale(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  return isSupportedLocale(cookieLocale) ? cookieLocale : await negotiateFromAcceptLanguage();
}

/**
 * Compares only the first two characters of each tag (no region-specific locales). `q` is parsed, not assumed: `q=0` means
 * "not acceptable" (RFC 9110 §12.4.2), so `de;q=0, en` rejects German, and weights fix out-of-order headers.
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
        // A malformed weight counts as unspecified (1), as browsers tolerate junk in this header.
        quality: Number.isNaN(quality) ? 1 : quality,
      };
    })
    // `q=0` is an explicit rejection, not a low preference.
    .filter((candidate) => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { lang } of candidates) {
    if (isSupportedLocale(lang)) {
      return lang;
    }
  }

  return DEFAULT_LOCALE;
}
