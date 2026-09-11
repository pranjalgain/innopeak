import type { TransformFnParams } from 'class-transformer';

/**
 * For a class-transformer `@Transform` on a `boolean`-typed DTO property.
 *
 * The global `ValidationPipe` runs with `enableImplicitConversion: true` (`bootstrap.ts`), which
 * coerces a `boolean`-typed property with a blind `Boolean(value)` before any `@Transform`
 * decorator on it runs — and `Boolean("false")` is `true`, because it is a non-empty string. A
 * form-encoded body or a query string sends every value as a string, so `autoPostEnabled=false`
 * silently becomes `true`, with `@IsBoolean()` never catching it: by the time validation runs,
 * the value already *is* the boolean `true`.
 *
 * `value` in the `@Transform` callback is that already-mangled result, not the original input —
 * verified against class-transformer's own source (implicit conversion runs, then the explicit
 * `@Transform`, in that order). `obj[key]` is what the fix needs instead: the untouched property
 * straight off the incoming plain object, before class-transformer has touched it.
 *
 * Only literal `true`/`false` (as a boolean or the exact string) are accepted; anything else —
 * `undefined` included — passes through unchanged for `@IsOptional()`/`@IsBoolean()` to judge, so
 * a genuinely invalid value (`"maybe"`) still reports a validation error instead of being guessed.
 */
export function parseBooleanInput({ obj, key }: TransformFnParams): unknown {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return raw;
}
