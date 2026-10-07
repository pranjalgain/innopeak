import 'reflect-metadata';

import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

import { parseBooleanInput } from './boolean.utils';

/**
 * Goes through a real `plainToInstance` with `enableImplicitConversion: true` (the `bootstrap.ts` pipe option
 * whose blind `Boolean(value)` this undoes); a direct call would miss regressions in how class-transformer calls it.
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
    // `Boolean("false")` is `true`, and implicit conversion runs it before any @Transform sees the value.
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
