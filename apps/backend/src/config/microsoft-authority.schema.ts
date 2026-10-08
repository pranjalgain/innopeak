import * as Joi from 'joi';

/**
 * Production may only point at Microsoft itself: the JWKS, token endpoint and expected issuer are all derived from this
 * value, so any other server would be trusted to vouch for any identity.
 */
export const microsoftAuthoritySchema = Joi.when('NODE_ENV', {
  is: 'production',
  then: Joi.string()
    .pattern(/^https:\/\/login\.microsoftonline\.com\/[^/]+\/?$/)
    .allow(null, ''),
  otherwise: Joi.string().uri().allow(null, ''),
});
