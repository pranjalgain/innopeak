import { DEFAULT_LOCALE, resolveLocale } from './locale';

describe('resolveLocale', () => {
  it('returns the default locale when no header is present', () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it('resolves a bare supported primary subtag', () => {
    expect(resolveLocale('de')).toBe('de');
    expect(resolveLocale('en')).toBe('en');
  });

  it('strips a region subtag and matches on the primary language alone', () => {
    // Region subtags are explicitly out of scope (see the locale contract) — de-AT/de-CH must
    // still resolve to plain `de`, not fall through to the default.
    expect(resolveLocale('de-DE')).toBe('de');
    expect(resolveLocale('en-US')).toBe('en');
  });

  it('is case-insensitive on the primary subtag', () => {
    expect(resolveLocale('DE')).toBe('de');
  });

  it('picks the highest-q supported candidate, ignoring unsupported higher-q ones', () => {
    // fr isn't supported at all; among the two that are, de has the higher q.
    expect(resolveLocale('fr;q=0.9, de;q=0.8, en;q=0.5')).toBe('de');
  });

  it('falls through an unsupported first choice to a supported later one', () => {
    expect(resolveLocale('fr, de;q=0.9')).toBe('de');
  });

  it('falls back to the default when nothing in the header is supported', () => {
    expect(resolveLocale('fr, es, ja')).toBe(DEFAULT_LOCALE);
  });

  it('falls back to the default on a q=0 (explicitly excluded) entry with nothing else supported', () => {
    expect(resolveLocale('de;q=0')).toBe(DEFAULT_LOCALE);
  });

  it('takes the first header value when Express delivers an array', () => {
    expect(resolveLocale(['de', 'en'])).toBe('de');
  });

  it('does not throw on a malformed header and falls back to the default', () => {
    expect(resolveLocale(';;;garbage;;;')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
  });
});
