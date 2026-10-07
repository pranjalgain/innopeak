import type { TransformFnParams } from 'class-transformer';

/**
 * For an `IsInt()` DTO property, replacing `@Type(() => Number)`: blind `Number(value)` turns `true`, `[6]` and `" 6 "`
 * into valid-looking integers that `@IsInt()` then accepts. Like `parseBooleanInput`, reads the untouched `obj[key]`.
 * Only a number or a digits-only string (optionally negative) is converted; anything else passes through for validation to judge.
 */
export function parseIntegerInput({ obj, key }: TransformFnParams): unknown {
  const raw = (obj as Record<string, unknown>)[key];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}
