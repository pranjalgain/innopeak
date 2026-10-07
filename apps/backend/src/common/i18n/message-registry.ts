import type { Locale } from './locale';
import type { MessageCatalog } from './message-catalog.type';
import { messagesDe } from './messages.de';
import { messagesEn } from './messages.en';

// `MESSAGES` leaves are tagged key strings, not English text; only `TransformInterceptor` and
// `HttpExceptionFilter` call `renderMessage` to translate, right before serializing the response.
// Tag: TAG_PREFIX + dotted key path (+ TAG_SEPARATOR + JSON args for interpolating entries). The
// NUL separator is built at runtime so no editor or diff has to render a raw control byte; it can't
// occur in catalog strings or JSON, so an untagged message (class-validator, Postgres, third-party)
// never collides and passes through `renderMessage` untouched.
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

export const MESSAGES: MessageCatalog = buildKeyedCatalog(messagesEn, '');

const CATALOGS_BY_LOCALE: Record<Locale, MessageCatalog> = {
  en: messagesEn,
  de: messagesDe,
};

// Own-property only: a forged tag with a segment like `constructor` must not resolve to an inherited member.
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
 * Untagged text (class-validator, Postgres, third-party) passes through, English-only: an accepted gap.
 *
 * `raw` is `unknown` because `@Catch()` receives anything thrown. This must never throw itself,
 * since it runs inside the exception filter.
 */
export function renderMessage(raw: unknown, locale: Locale): string {
  if (typeof raw !== 'string') {
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

  // Allowlist: only string and function leaves render; anything else falls back to the raw tag,
  // visibly wrong rather than silently wrong or a crash. The function call is wrapped because a
  // corrupted tag can carry bad JSON args, and nothing above this edge layer would catch the throw.
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
 * Some controllers return a payload whose own `message` field repeats the envelope's tagged
 * message, which would reach clients un-rendered. Scoped to that one field; nothing else on `data` is walked.
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
