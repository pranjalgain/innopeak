import type { TransformFnParams } from 'class-transformer';

/**
 * For a class-transformer `@Transform` on an `IsInt()`-validated DTO property, replacing a bare
 * `@Type(() => Number)`.
 *
 * `@Type(() => Number)` (and the global `ValidationPipe`'s own `enableImplicitConversion: true`,
 * `bootstrap.ts`) both coerce with a blind `Number(value)`, which is far more permissive than the
 * property actually intends: `Number(true) === 1`, `Number([6]) === 6` (an array with one element
 * stringifies to `"6"` first), and `Number(" 6 ")` silently trims whitespace a genuine client
 * never meant to send. All three land on a valid-looking integer, so `@IsInt()`/`@Min()`/`@Max()`
 * downstream never see anything to reject — a boolean, an array, or a malformed string is
 * silently accepted as if it were the number it happened to coerce to.
 *
 * Same shape as `parseBooleanInput`: `obj[key]` is the untouched value straight off the incoming
 * plain object, read before class-transformer's implicit conversion has mangled it. Only a
 * genuine number or a string of nothing but digits (optionally negative) is converted; everything
 * else — `true`, `[6]`, `" 6 "`, `null`, `undefined` — passes through unchanged for
 * `@IsInt()`/`@IsOptional()` to judge on its actual shape, rather than on what it happens to
 * coerce to.
 */
export function parseIntegerInput({ obj, key }: TransformFnParams): unknown {
  const raw = (obj as Record<string, unknown>)[key];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}
