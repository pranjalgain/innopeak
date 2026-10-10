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

/**
 * Stands in for the NUL delimiter in a stored tag: Postgres text columns reject NUL, so a raw tag fails the write.
 * U+2063 (invisible separator) never occurs in our messages or in provider error text.
 */
const STORED_MARK = '\u2063';
const STORED_TAG_PREFIX = TAG_PREFIX.split(CONTROL_CHAR).join(STORED_MARK);

/**
 * Makes text safe to write to a database column: any `MESSAGES` tag in it (on its own, or ending a longer string
 * such as `classification failed: <tag>`) is kept as a tag, so it is still rendered in the reader's language when
 * it leaves the API (`renderStoredMessages`). Called by the repositories that persist error text.
 */
export function toStoredMessage(text: string): string;
export function toStoredMessage(text: string | null): string | null;
export function toStoredMessage(text: string | null): string | null {
  return text === null ? null : text.split(CONTROL_CHAR).join(STORED_MARK);
}

/** Renders a stored tag back into text in `locale`; text without one is returned unchanged. */
export function renderStoredMessage(text: string, locale: Locale): string {
  const index = text.indexOf(STORED_TAG_PREFIX);
  if (index === -1) {
    return text;
  }
  const tag = text.slice(index).split(STORED_MARK).join(CONTROL_CHAR);
  return text.slice(0, index) + renderMessage(tag, locale);
}

/**
 * Renders every stored tag in a response payload, at any depth. Stored error text (a reply's post failure, a sync
 * run's error) reaches clients inside `data`, which `renderNestedMessage` does not walk. Copy-on-write: a subtree
 * with nothing to render is returned as the same object, so a payload without stored text costs one read-only pass.
 */
export function renderStoredMessages<T>(data: T, locale: Locale): T {
  if (typeof data === 'string') {
    return (data.includes(STORED_MARK) ? renderStoredMessage(data, locale) : data) as T;
  }
  if (Array.isArray(data)) {
    let copy: unknown[] | null = null;
    data.forEach((item: unknown, index: number) => {
      const rendered = renderStoredMessages(item, locale);
      if (rendered !== item) {
        copy ??= [...data];
        copy[index] = rendered;
      }
    });
    return (copy ?? data) as T;
  }
  if (typeof data === 'object' && data !== null) {
    const prototype: unknown = Object.getPrototypeOf(data);
    // Plain objects only: a Date, Buffer or class instance is passed through untouched.
    if (prototype !== Object.prototype && prototype !== null) {
      return data;
    }
    let copy: Record<string, unknown> | null = null;
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const rendered = renderStoredMessages(value, locale);
      if (rendered !== value) {
        copy ??= { ...(data as Record<string, unknown>) };
        copy[key] = rendered;
      }
    }
    return (copy ?? data) as T;
  }
  return data;
}
