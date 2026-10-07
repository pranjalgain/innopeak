import 'reflect-metadata';

import { plainToInstance, Transform } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

import { parseIntegerInput } from './number.utils';

/**
 * Goes through a real `plainToInstance` with `enableImplicitConversion: true` (the `bootstrap.ts` pipe option
 * whose blind `Number(value)` this narrows); a direct call would miss regressions in how class-transformer calls it.
 */
class IntegerProbeDto {
  @IsOptional()
  @Transform(parseIntegerInput)
  @IsInt()
  count?: number;
}

function transform(raw: unknown): IntegerProbeDto {
  const input = raw === undefined ? {} : { count: raw };
  return plainToInstance(IntegerProbeDto, input, { enableImplicitConversion: true });
}

describe('parseIntegerInput', () => {
  it('passes an actual number through unchanged', () => {
    expect(transform(24).count).toBe(24);
    expect(transform(0).count).toBe(0);
    expect(transform(-3).count).toBe(-3);
  });

  it('reads a clean digit string as its number', () => {
    expect(transform('24').count).toBe(24);
    expect(transform('-3').count).toBe(-3);
  });

  it('does not coerce a boolean into 1 or 0', () => {
    // `@Type(() => Number)`'s `Number(true) === 1` let a boolean pass @IsInt() as 1.
    expect(transform(true).count).toBe(true);
    expect(transform(false).count).toBe(false);
  });

  it('does not coerce a single-element array into its element', () => {
    // `Number([6]) === 6` — an array stringifies to "6" first.
    expect(transform([6]).count).toEqual([6]);
  });

  it('does not trim whitespace out of a padded numeric string', () => {
    expect(transform(' 6 ').count).toBe(' 6 ');
  });

  it('leaves a non-numeric string for @IsInt() to reject, rather than guessing', () => {
    expect(transform('not-a-number').count).toBe('not-a-number');
    expect(transform('6.5').count).toBe('6.5');
  });

  it('passes null through unchanged, for a nullable property’s own @ValidateIf to judge', () => {
    expect(transform(null).count).toBeNull();
  });

  it('leaves an omitted value as undefined for @IsOptional()', () => {
    expect(transform(undefined).count).toBeUndefined();
  });
});
