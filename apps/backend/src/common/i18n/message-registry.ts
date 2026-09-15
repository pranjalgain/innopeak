import type { Locale } from './locale';
import type { MessageCatalog } from './message-catalog.type';
import { messagesDe } from './messages.de';
import { messagesEn } from './messages.en';

/**
 * "Services keep throwing and returning stable message *keys*, and exactly one layer translates"
 * (the multilingual design doc's recommended approach). `MESSAGES.AUTH.INVALID_CREDENTIALS` used
 * to be the literal English sentence, evaluated once at the throw site with no request context to
 * translate against. It is now a *tagged key string* — still just a `string` (or, for the two
 * interpolating entries, still a function returning a `string`), so every existing call site
 * (`throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CREDENTIALS)`,
 * `ResponseUtil.success(data, MESSAGES.PROMPTS.LISTED)`, the handful of specs asserting
 * `.rejects.toThrow(MESSAGES.X.Y)`) keeps compiling and passing completely unchanged. The only two
 * places that need to know the tag exists are `TransformInterceptor` (the success-response edge)
 * and `HttpExceptionFilter` (the error-response edge), which call `renderMessage` right before the
 * response is serialized.
 *
 * Tag format: `TAG_PREFIX` followed by a dotted key path, with a further `TAG_SEPARATOR` plus
 * JSON-encoded args for an interpolating entry. The separator character is the ASCII control
 * character at code point zero, built at runtime with `String.fromCharCode(0)` rather than typed
 * literally in this file, so no editor, terminal, or diff view downstream ever has to render a raw
 * control byte from this source. That character cannot appear in any hand-written catalog string
 * or in JSON-encoded args, so a tagged key can never collide with an ordinary message that never
 * went through `MESSAGES` (a class-validator message, a Postgres error string, a third-party
 * library's error text) — `renderMessage` passes anything without the prefix straight through
 * untouched.
 */
const CONTROL_CHAR = String.fromCharCode(0);
const TAG_PREFIX = `${CONTROL_CHAR}i18n${CONTROL_CHAR}`;
const TAG_SEPARATOR = CONTROL_CHAR;

type CatalogValue = string | ((...args: never[]) => string) | { [key: string]: CatalogValue };

function tag(path: string, args?: unknown[]): string {
  if (args === undefined) {
    return `${TAG_PREFIX}${path}`;
  }
  return `${TAG_PREFIX}${path}${TAG_SEPARATOR}${JSON.stringify(args)}`;
}

/** Recursively mirrors a catalog's shape, replacing every leaf with a tagged-key string (plain
 *  leaves) or a function that produces one (interpolating leaves) — never the rendered text. */
function buildKeyedCatalog<T>(node: T, path: string): T {
  if (typeof node === 'function') {
    return ((...args: unknown[]) => tag(path, args)) as unknown as T;
  }
  if (typeof node === 'string') {
    return tag(path) as unknown as T;
  }
  if (typeof node === 'object' && node !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, CatalogValue>)) {
      result[key] = buildKeyedCatalog(value, path ? `${path}.${key}` : key);
    }
    return result as T;
  }
  throw new Error(`Unexpected message catalog node at "${path}"`);
}

/**
 * The object every existing call site imports as `MESSAGES` (via
 * `@common/constants/messages.constants`, which now just re-exports this). Same shape and same
 * leaf types as the catalog it's built from (`messagesEn`) — a string stays a string, an
 * interpolating function keeps the same parameters and return type — so nothing downstream of
 * `MESSAGES.X.Y` needs to change; only what the string *contains* changed, from rendered English
 * to a tagged key `renderMessage` resolves later.
 */
export const MESSAGES: MessageCatalog = buildKeyedCatalog(messagesEn, '');

const CATALOGS_BY_LOCALE: Record<Locale, MessageCatalog> = {
  en: messagesEn,
  de: messagesDe,
};

/**
 * Own-property only — `path.split('.')` walking a plain object could otherwise resolve to an
 * inherited member (`constructor`, `toString`, `hasOwnProperty`, …) on `Object.prototype`. A
 * malformed or forged tag containing a path segment like `constructor` must land on "not found",
 * never on `Object`'s own `constructor` function.
 */
function getByPath(catalog: MessageCatalog, path: string): CatalogValue | undefined {
  let current: unknown = catalog;
  for (const segment of path.split('.')) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as CatalogValue | undefined;
}

/**
 * The rendering step both response edges call. Anything that isn't a tagged key (the common case
 * for text that never went through `MESSAGES` — class-validator output, a Postgres error, a
 * third-party error message) is returned unchanged, English-only for now; that's an accepted,
 * explicit gap, not a bug this function is responsible for closing.
 *
 * `raw` is deliberately typed wider than `string`: both call sites ultimately derive it from a
 * caught exception's `.message`, and `@Catch()` (no argument) catches literally anything a service
 * can throw — a plain string, a rejected promise's non-Error reason, `undefined` — not just real
 * `Error`/`HttpException` instances, whatever a call site's own type annotation claims. This must
 * never throw *itself*, or the exception filter it runs inside has nothing left to catch it.
 */
export function renderMessage(raw: unknown, locale: Locale): string {
  if (typeof raw !== 'string') {
    // `raw` is deliberately `unknown` (see the doc comment above) — this must coerce literally
    // anything without throwing, `[object Object]` included, rather than assume every non-string
    // has a meaningful `toString()`.
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return raw === undefined || raw === null ? '' : String(raw);
  }
  if (!raw.startsWith(TAG_PREFIX)) {
    return raw;
  }

  const withoutPrefix = raw.slice(TAG_PREFIX.length);
  const separatorIndex = withoutPrefix.indexOf(TAG_SEPARATOR);
  const path = separatorIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, separatorIndex);
  const argsJson = separatorIndex === -1 ? undefined : withoutPrefix.slice(separatorIndex + 1);

  const catalog = CATALOGS_BY_LOCALE[locale];
  const entry = getByPath(catalog, path);

  // An allowlist, not a blocklist: only a string leaf is returned as-is and only a function leaf
  // is invoked. Every other outcome — not found, a nested object (no real catalog leaf is ever
  // one), or anything else `getByPath` could in principle return — falls back to the raw tag
  // string. Visibly wrong (a client sees the literal tag) beats silently wrong (a non-string value,
  // or an inherited member, shipped as `ApiResponse.message`) or an outright crash.
  //
  // The function branch is additionally wrapped: a corrupted tag can carry unparseable JSON args,
  // or JSON args of the wrong shape for the target function (e.g. a number where an array is
  // expected) — both throw from inside this call, and this must degrade the same way malformed
  // input elsewhere in this function does, not propagate out of an edge layer with no one above it
  // to catch it.
  if (typeof entry === 'function') {
    try {
      const args = argsJson ? (JSON.parse(argsJson) as unknown[]) : [];
      return (entry as (...fnArgs: unknown[]) => string)(...args);
    } catch {
      return raw;
    }
  }

  if (typeof entry === 'string') {
    return entry;
  }

  return raw;
}

/**
 * Several controllers (`AuthController.resendOtp`/`logout`, `BlocklistTermsController.remove`,
 * `AuthController.signup`/`login`'s pending-verification branch) return a service result that
 * duplicates the same `MESSAGES.X.Y` value both as the response envelope's own `message` (which
 * `TransformInterceptor`/`HttpExceptionFilter` already render) and as a `message` field *inside*
 * the payload itself (`ResponseUtil.success(response, response.message, ...)`, where `response`
 * becomes `data`). That inner copy is a locale-agnostic tag exactly like the outer one — it never
 * goes through a separate rendering step of its own — so without this, a real client would see
 * the correctly-rendered envelope message sitting alongside a raw, un-rendered tag in
 * `data.message`. Scoped to exactly that one well-known field name; everything else on `data` is
 * left untouched, never walked into guessing at what else might be a message.
 */
export function renderNestedMessage<T>(data: T, locale: Locale): T {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof (data as { message: unknown }).message === 'string'
  ) {
    return {
      ...data,
      message: renderMessage((data as { message: string }).message, locale),
    };
  }
  return data;
}
