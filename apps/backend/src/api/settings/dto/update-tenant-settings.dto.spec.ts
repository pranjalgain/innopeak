import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { UpdateTenantSettingsDto } from './update-tenant-settings.dto';

const POSTGRES_INTEGER_MAX = 2147483647;

const validBody = {
  escalationRatingThreshold: 3,
  autoPostEnabled: false,
  aiReplyCount: 1,
};

/**
 * `reviewDataRetentionMonths` had `@Min(1)` but no upper bound, while the column behind it is a
 * Postgres `INTEGER`. A value past that column's own range reached the database uncaught and
 * surfaced as a 500 (`22003 value out of range`) instead of the validation 400 every other bad
 * input on this route gets. Exercised through the real global `ValidationPipe` options
 * (`enableImplicitConversion: true`) rather than calling `class-validator` directly.
 */
function validate(reviewDataRetentionMonths: unknown): { errors: number; value: unknown } {
  const dto = plainToInstance(
    UpdateTenantSettingsDto,
    { ...validBody, reviewDataRetentionMonths },
    { enableImplicitConversion: true }
  );
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { errors: errors.length, value: dto.reviewDataRetentionMonths };
}

describe('UpdateTenantSettingsDto.reviewDataRetentionMonths', () => {
  it('accepts an ordinary value', () => {
    expect(validate(24)).toEqual({ errors: 0, value: 24 });
  });

  it('accepts null (opts the tenant out of the purge — no platform default) and omission', () => {
    expect(validate(null).errors).toBe(0);

    const dto = plainToInstance(UpdateTenantSettingsDto, validBody, {
      enableImplicitConversion: true,
    });
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it("accepts Postgres's own INTEGER ceiling — no product-level cap", () => {
    expect(validate(POSTGRES_INTEGER_MAX).errors).toBe(0);
  });

  it('rejects one past that ceiling as a 400, rather than letting it reach Postgres', () => {
    expect(validate(POSTGRES_INTEGER_MAX + 1).errors).toBeGreaterThan(0);
  });

  it('rejects a wildly out-of-range value the same way', () => {
    expect(validate(99999999999).errors).toBeGreaterThan(0);
  });
});

/**
 * `@Type(() => Number)` (what all three integer fields used before this fix) coerces with a
 * blind `Number(value)` — `Number(true) === 1`, `Number([6]) === 6`, `Number(" 6 ") === 6` — so a
 * boolean, an array, or a whitespace-padded string all landed on a valid-looking integer and
 * `@IsInt()`/`@Min()`/`@Max()` never saw anything to reject. Exercised through the real global
 * `ValidationPipe` options, same as the suite above.
 */
describe('UpdateTenantSettingsDto numeric fields reject non-numeric JSON types', () => {
  function validateField(field: string, value: unknown): number {
    const dto = plainToInstance(
      UpdateTenantSettingsDto,
      { ...validBody, [field]: value },
      { enableImplicitConversion: true }
    );
    return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length;
  }

  const fields = ['escalationRatingThreshold', 'aiReplyCount', 'reviewDataRetentionMonths'];

  it.each(fields)('rejects a boolean for %s instead of coercing it to 1 or 0', field => {
    expect(validateField(field, true)).toBeGreaterThan(0);
  });

  it.each(fields)(
    'rejects a single-element array for %s instead of coercing it to its element',
    field => {
      expect(validateField(field, [3])).toBeGreaterThan(0);
    }
  );

  it.each(fields)('rejects a whitespace-padded numeric string for %s', field => {
    expect(validateField(field, ' 3 ')).toBeGreaterThan(0);
  });

  it.each(fields)('still accepts a clean digit string for %s', field => {
    expect(validateField(field, '3')).toBe(0);
  });
});
