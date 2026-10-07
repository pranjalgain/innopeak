// Bare BCP-47 primary subtags; regional variants (`de-AT`/`de-CH`) are out of scope.
export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Hand-rolled instead of a negotiation library: two locales and no regions need only primary-subtag matching ordered by q. */
export function resolveLocale(acceptLanguageHeader: string[] | string | undefined): Locale {
  const header = Array.isArray(acceptLanguageHeader)
    ? acceptLanguageHeader[0]
    : acceptLanguageHeader;

  if (!header) {
    return DEFAULT_LOCALE;
  }

  const candidates = header
    .split(',')
    .map(part => {
      const [tagPart, ...paramParts] = part.trim().split(';');
      const primary = tagPart?.split('-')[0]?.toLowerCase().trim();

      let q = 1;
      for (const param of paramParts) {
        const [key, value] = param.trim().split('=');
        if (key === 'q' && value !== undefined) {
          const parsed = Number.parseFloat(value);
          q = Number.isFinite(parsed) ? parsed : 0;
        }
      }

      return { primary, q };
    })
    .filter((candidate): candidate is { primary: string; q: number } => Boolean(candidate.primary))
    // Sort is stable (ES2019+), so ties keep the header's left-to-right order, which senders rely on.
    .sort((a, b) => b.q - a.q);

  for (const candidate of candidates) {
    if (candidate.q > 0 && isSupportedLocale(candidate.primary)) {
      return candidate.primary;
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * Order: the user's stored preference (the access token's `locale` claim), then `Accept-Language`,
 * then `DEFAULT_LOCALE`. `userLocale` is `undefined` with no authenticated user and `null` when
 * they never chose one; both fall through identically.
 */
export function resolveRequestLocale(
  userLocale: Locale | null | undefined,
  acceptLanguageHeader: string[] | string | undefined
): Locale {
  if (userLocale) {
    return userLocale;
  }
  return resolveLocale(acceptLanguageHeader);
}
