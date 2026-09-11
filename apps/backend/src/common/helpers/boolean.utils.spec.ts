import 'reflect-metadata';

import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { parseBooleanInput } from './boolean.utils';

/**
 * Exercised through a real `plainToInstance` with `enableImplicitConversion: true` — the exact
 * global `ValidationPipe` option (`bootstrap.ts`) whose blind `Boolean(value)` coercion this
 * function exists to undo. A unit test calling `parseBooleanInput` directly with a hand-built
 * `{ value, obj, key }` would not catch a regression in *how* class-transformer's pipeline calls
 * it — only a real transform does.
 */
class BooleanProbeDto {
  @IsOptional()
  @Transform(parseBooleanInput)
  @IsBoolean()
  flag?: boolean;
}

function transform(raw: unknown): BooleanProbeDto {
  const input = raw === undefined ? {} : { flag: raw };
  return plainToInstance(BooleanProbeDto, input, { enableImplicitConversion: true });
}

describe('parseBooleanInput', () => {
  it('reads the string "false" as false, not true', () => {
    // The bug this exists to fix: class-transformer's implicit conversion runs `Boolean(value)`
    // on a boolean-typed property before any @Transform sees it, and `Boolean("false")` is
    // `true` — a non-empty string is truthy in plain JS.
    expect(transform('false').flag).toBe(false);
  });

  it('reads the string "true" as true', () => {
    expect(transform('true').flag).toBe(true);
  });

  it('passes an actual boolean through unchanged', () => {
    expect(transform(false).flag).toBe(false);
    expect(transform(true).flag).toBe(true);
  });

  it('leaves an unrecognized value for @IsBoolean() to reject, rather than guessing', () => {
    expect(transform('no').flag).toBe('no');
    expect(transform('0').flag).toBe('0');
    expect(transform('maybe').flag).toBe('maybe');
  });

  it('leaves an omitted value as undefined for @IsOptional()', () => {
    expect(transform(undefined).flag).toBeUndefined();
  });
});
