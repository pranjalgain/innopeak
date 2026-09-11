/**
 * Exactly two locales, per the multilingual design doc
 * (`apps/documentation/docs/meta/multilingual.md`) — not a locale framework with one locale
 * plugged in. Bare BCP-47 primary subtags, no region (`de-AT`/`de-CH` are out of scope).
 */
export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Negotiates a request's `Accept-Language` header against `SUPPORTED_LOCALES`, falling back to
 * `DEFAULT_LOCALE`. This is the resolution order's step 2 (anonymous traffic, or a signed-in user
 * who never set `users.locale`) — see `resolveRequestLocale` for the full 3-step order.
 *
 * A small hand-rolled parser rather than a negotiation library: with exactly two locales and no
 * region subtags, the only thing that matters is "does any weighted entry's primary subtag match
 * `en` or `de`, ordered by q-value" — a library's generality buys nothing here.
 */
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
    // Stable sort by descending q — Array.prototype.sort is stable per spec (ES2019+), so ties
    // keep the header's own left-to-right order, which is itself a tie-break convention senders
    // rely on.
    .sort((a, b) => b.q - a.q);

  for (const candidate of candidates) {
    if (candidate.q > 0 && isSupportedLocale(candidate.primary)) {
      return candidate.primary;
    }
  }

  return DEFAULT_LOCALE;
}

/**
 * The full 3-step resolution order from the design doc: 1) the authenticated user's stored
 * preference (embedded in the access token's `locale` claim — see `TokenService.signTokenPair`),
 * 2) `Accept-Language` negotiation, 3) `DEFAULT_LOCALE`. `userLocale` is `undefined` for requests
 * with no authenticated user at all (a `@Public()` route reached before `JwtAuthGuard` ran, or an
 * exception thrown ahead of it) and `null` for an authenticated user who never chose one — both
 * fall through to step 2 identically.
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
