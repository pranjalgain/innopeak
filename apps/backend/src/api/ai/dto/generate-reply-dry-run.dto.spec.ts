import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GenerateReplyDryRunDto } from './generate-reply-dry-run.dto';

/**
 * Exercises the DTO through the *same* two steps the global `ValidationPipe` runs
 * (`bootstrap.ts`: `transform: true`, `whitelist: true`, `forbidNonWhitelisted: true`) —
 * `plainToInstance` then `validate` — rather than through the service, which every other spec in
 * this module calls directly and therefore never sees this boundary at all. The null case below
 * was a real 500.
 */
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function transform(body: Record<string, unknown>): GenerateReplyDryRunDto {
  return plainToInstance(GenerateReplyDryRunDto, body);
}

const validBody = {
  category: 'positive',
  review: { reviewerName: 'Jamie L.', rating: 5, reviewText: 'Loved it!' },
};

/** Built from char codes rather than written inline: these are exactly the characters
 *  `sanitizePromptTemplate` strips (zero-width space, NUL, BOM), so as source literals they'd be
 *  invisible in the file and the next editor would have no way to tell them from empty strings. */
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const STRIPPED_ONLY = String.fromCharCode(0x200b, 0x0000, 0xfeff);

describe('GenerateReplyDryRunDto', () => {
  it('survives plainToInstance as a real class instance, so toServiceInput() exists', async () => {
    // The controller calls `dto.toServiceInput()`; that only works because the pipe's
    // `transform: true` builds an actual instance rather than handing over the plain body.
    const dto = transform(validBody);

    expect(dto).toBeInstanceOf(GenerateReplyDryRunDto);
    expect(typeof dto.toServiceInput).toBe('function');
    await expect(validate(dto, PIPE_OPTIONS)).resolves.toEqual([]);
    expect(dto.toServiceInput()).toEqual({
      category: 'positive',
      review: { reviewerName: 'Jamie L.', rating: 5, reviewText: 'Loved it!' },
    });
  });

  it('treats an explicit null override as absent instead of forwarding it to the service', async () => {
    // Regression: `@IsOptional()` skips validation on null as well as undefined, so this body
    // passes validation untouched. An earlier `toServiceInput()` omitted only `undefined`, so the
    // null was forwarded, took the service's `templateOverride !== undefined` branch, and reached
    // `sanitizePromptTemplate(null)` -> TypeError -> 500 on a request that means "no override".
    const dto = transform({ ...validBody, templateOverride: null, toneOverride: null });

    await expect(validate(dto, PIPE_OPTIONS)).resolves.toEqual([]);

    const input = dto.toServiceInput();
    expect(Object.hasOwn(input, 'templateOverride')).toBe(false);
    expect(Object.hasOwn(input, 'toneOverride')).toBe(false);
  });

  it('rejects a whitespace-only templateOverride once sanitization has emptied it', async () => {
    // The @Transform runs first (sanitize + trim), so validation sees '' and @IsNotEmpty fires —
    // a 400, rather than an empty prompt being sent to a real, billable AI provider.
    const errors = await validate(
      transform({ ...validBody, templateOverride: '   ' }),
      PIPE_OPTIONS
    );

    expect(errors.map(error => error.property)).toEqual(['templateOverride']);
  });

  it('rejects a templateOverride made only of stripped control/zero-width characters', async () => {
    const errors = await validate(
      transform({ ...validBody, templateOverride: STRIPPED_ONLY }),
      PIPE_OPTIONS
    );

    expect(errors.map(error => error.property)).toEqual(['templateOverride']);
  });

  it('passes a real override through, sanitized and trimmed', async () => {
    const dto = transform({
      ...validBody,
      templateOverride: `  Thank {{reviewer_name}}!${ZERO_WIDTH_SPACE}  `,
      toneOverride: 'playful',
    });

    await expect(validate(dto, PIPE_OPTIONS)).resolves.toEqual([]);
    expect(dto.toServiceInput()).toEqual({
      category: 'positive',
      review: validBody.review,
      templateOverride: 'Thank {{reviewer_name}}!',
      toneOverride: 'playful',
    });
  });

  it('rejects an unknown category and an out-of-range rating', async () => {
    const badCategory = await validate(
      transform({ ...validBody, category: 'furious' }),
      PIPE_OPTIONS
    );
    expect(badCategory.map(error => error.property)).toEqual(['category']);

    const badRating = await validate(
      transform({ ...validBody, review: { ...validBody.review, rating: 6 } }),
      PIPE_OPTIONS
    );
    // Nested failures surface on the parent property, with the child error inside it.
    expect(badRating.map(error => error.property)).toEqual(['review']);
  });
});
