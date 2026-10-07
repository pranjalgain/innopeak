import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GenerateReplyDryRunDto } from './generate-reply-dry-run.dto';

// Mirrors the global ValidationPipe (plainToInstance then validate); service specs bypass this boundary.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function transform(body: Record<string, unknown>): GenerateReplyDryRunDto {
  return plainToInstance(GenerateReplyDryRunDto, body);
}

const validBody = {
  category: 'positive',
  review: { reviewerName: 'Jamie L.', rating: 5, reviewText: 'Loved it!' },
};

// Built from char codes: as literals these characters (stripped by sanitizePromptTemplate) would be invisible.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const STRIPPED_ONLY = String.fromCharCode(0x200b, 0x0000, 0xfeff);

describe('GenerateReplyDryRunDto', () => {
  it('rejects a body with no `review` (previously an unhandled 500 in toServiceInput)', async () => {
    const dto = transform({ category: 'positive' });

    const errors = await validate(dto, PIPE_OPTIONS);

    expect(errors.map(e => e.property)).toContain('review');
  });

  it('survives plainToInstance as a real class instance, so toServiceInput() exists', async () => {
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
    // Regression: @IsOptional() lets null through validation; forwarding it reached sanitizePromptTemplate(null) -> 500.
    const dto = transform({ ...validBody, templateOverride: null, toneOverride: null });

    await expect(validate(dto, PIPE_OPTIONS)).resolves.toEqual([]);

    const input = dto.toServiceInput();
    expect(Object.hasOwn(input, 'templateOverride')).toBe(false);
    expect(Object.hasOwn(input, 'toneOverride')).toBe(false);
  });

  it('rejects a whitespace-only templateOverride once sanitization has emptied it', async () => {
    // The @Transform runs first, so validation sees '' and returns 400 instead of sending an empty prompt to a billable provider.
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
    expect(badRating.map(error => error.property)).toEqual(['review']);
  });
});
