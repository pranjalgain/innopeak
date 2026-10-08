import * as Joi from 'joi';

import { microsoftAuthoritySchema } from './microsoft-authority.schema';

const schema = Joi.object({
  NODE_ENV: Joi.string().required(),
  MICROSOFT_AUTHORITY: microsoftAuthoritySchema,
});

const validate = (
  NODE_ENV: string,
  MICROSOFT_AUTHORITY?: string
): Joi.ValidationError | undefined => schema.validate({ NODE_ENV, MICROSOFT_AUTHORITY }).error;

describe('MICROSOFT_AUTHORITY', () => {
  // Regression: production accepted any URL, whose server's tokens would then be trusted.
  it.each([
    'http://localhost:4100/microsoft/common',
    'https://evil.example/common',
    'http://login.microsoftonline.com/common',
    'https://login.microsoftonline.com.evil.example/common',
  ])('refuses %s in production', authority => {
    expect(validate('production', authority)).toBeDefined();
  });

  it.each([
    'https://login.microsoftonline.com/common',
    'https://login.microsoftonline.com/organizations/',
    'https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad',
  ])('accepts %s in production', authority => {
    expect(validate('production', authority)).toBeUndefined();
  });

  it('accepts it unset in production, falling back to the Microsoft default', () => {
    expect(validate('production', '')).toBeUndefined();
    expect(validate('production')).toBeUndefined();
  });

  it('only requires a URL outside production', () => {
    expect(validate('development', 'http://localhost:4100/microsoft/common')).toBeUndefined();
    expect(validate('development', 'not a url')).toBeDefined();
  });
});
