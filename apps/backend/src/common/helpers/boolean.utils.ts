import type { TransformFnParams } from 'class-transformer';

/**
 * For a `@Transform` on a `boolean` DTO property: the global `ValidationPipe`'s `enableImplicitConversion` runs a blind
 * `Boolean(value)` first, so `"false"` becomes `true` before `@IsBoolean()` can notice. `value` is that mangled
 * result; `obj[key]` is the original input.
 * Only literal true/false (boolean or exact string) are converted; anything else passes through for validation to judge.
 */
export function parseBooleanInput({ obj, key }: TransformFnParams): unknown {
  const raw = (obj as Record<string, unknown>)[key];
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return raw;
}
