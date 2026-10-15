import { JWT_SECRET_MIN_LENGTH } from '@auth/constants/auth.constants';
import { ALLOWED_AZURE_OPENAI_REGIONS } from '@common/constants/azure-openai.constants';
import { DEFAULT_ERASURE_GRACE_PERIOD_DAYS } from '@common/constants/erasure.constants';
import * as Joi from 'joi';

import { microsoftAuthoritySchema } from './microsoft-authority.schema';

/**
 * The environment contract, as a pure Joi schema with no side effects on import (unlike `EnvConfigModule`, which validates the
 * live `process.env` as it loads), so it can be unit-tested. Production-only requirements are expressed here with `Joi.when`.
 */
export const validationSchema = Joi.object({
  PORT: Joi.number().port().required(),
  NODE_ENV: Joi.string().valid('development', 'production').required(),
  CORS_ORIGINS: Joi.string().required().disallow(null, ''),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().required(),
  REDIS_PASSWORD: Joi.string().required(),
  REDIS_TLS_ENABLED: Joi.boolean().default(false),
  POSTGRES_DB: Joi.string().required(),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_HOST: Joi.string().required(),
  POSTGRES_PORT: Joi.number().port().required(),
  DATABASE_URL: Joi.string()
    .required()
    .pattern(/^postgresql:\/\//)
    .messages({
      'string.pattern.base': 'DATABASE_URL must start with "postgresql://"',
      'string.empty': 'DATABASE_URL is required',
    }),
  DEFAULT_PAGE: Joi.number().default(1),
  DEFAULT_PAGE_SIZE: Joi.number().default(10),
  // Optional: nothing under src/ reads it yet (reserved for OAuth/redirect URLs), so requiring it
  // would fail boot everywhere it is unset.
  FRONTEND_URL: Joi.string().uri().allow(null, '').optional(),
  VERIFY_EMAIL_OTP_TTL_MINUTES: Joi.number().integer().positive().default(10),
  DEV_VERIFY_EMAIL_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().allow(null, ''),
  }),
  // HS256's strength is bounded by the secret's entropy: a short one is brute-forceable offline
  // from any single captured token, after which anyone can mint tokens for any account.
  JWT_SECRET: Joi.string().min(JWT_SECRET_MIN_LENGTH).required(),
  // "Must differ from JWT_SECRET in production" isn't expressible in Joi without a custom validator; see the manual check above.
  JWT_REFRESH_SECRET: Joi.string().min(JWT_SECRET_MIN_LENGTH).allow(null, ''),
  // Required in production: it must be a conscious answer to "how many proxies are in front of this?". Unset behind a load balancer,
  // every caller shares one rate-limit bucket; set too high, a client can spoof its address. 0 is right only when directly exposed.
  TRUST_PROXY_HOPS: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.number().integer().min(0).required(),
    otherwise: Joi.number().integer().min(0).default(0),
  }),
  METRICS_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(24).required(),
    otherwise: Joi.string().allow(null, '').optional(),
  }),
  DB_POOL_MAX: Joi.number().integer().min(1).max(200).optional(),
  DB_IDLE_TIMEOUT_MS: Joi.number().integer().min(0).optional(),
  DB_CONNECTION_TIMEOUT_MS: Joi.number().integer().min(0).optional(),
  DB_STATEMENT_TIMEOUT_MS: Joi.number().integer().min(0).optional(),
  DB_SSL: Joi.string().valid('true', 'false').optional(),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.string().valid('true', 'false').optional(),
  // Optional like FRONTEND_URL: developers not working on connections have none set; the routes that need them answer 503 (see GoogleBusinessProfileProvider).
  GOOGLE_AUTH_STATE_SECRET: Joi.string().allow(null, ''),
  MICROSOFT_CLIENT_ID: Joi.string().allow(null, ''),
  MICROSOFT_CLIENT_SECRET: Joi.string().allow(null, ''),
  MICROSOFT_CALLBACK_URL: Joi.string().uri().allow(null, ''),
  MICROSOFT_AUTHORITY: microsoftAuthoritySchema,
  ADMIN_MICROSOFT_TENANT_ID: Joi.string()
    .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .allow(null, ''),
  GBP_CLIENT_ID: Joi.string().allow(null, ''),
  GBP_CLIENT_SECRET: Joi.string().allow(null, ''),
  GBP_CALLBACK_URL: Joi.string().uri().allow(null, ''),
  // "Must be set in production" is the manual check above, keeping both halves of the secret rules in one place.
  GBP_STATE_SECRET: Joi.string().allow(null, ''),
  CREDENTIAL_ENCRYPTION_KEY: Joi.string().base64().allow(null, ''),
  PAYMENT_FEATURE_ENABLED: Joi.string().valid('true', 'false').allow(null, ''),
  // Required in production, and in any environment that turns payments on: without the webhook secret `StripePaymentProvider`
  // defaults to an empty string and rejects every real delivery with no boot-time signal. Optional otherwise, so an install
  // that never takes payments needs no Stripe keys (its client is created on first use).
  STRIPE_SECRET_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.when('PAYMENT_FEATURE_ENABLED', {
      is: 'true',
      then: Joi.string().required(),
      otherwise: Joi.string().allow(null, ''),
    }),
  }),
  STRIPE_WEBHOOK_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.when('PAYMENT_FEATURE_ENABLED', {
      is: 'true',
      then: Joi.string().required(),
      otherwise: Joi.string().allow(null, ''),
    }),
  }),
  STRIPE_PRICE_ID_PAID: Joi.string().allow(null, ''),
  // Optional in every environment: providers validate their own config lazily on first call (a missing key fails that
  // generation with `AiProviderNotConfiguredException`, not app startup).
  AI_PROVIDER: Joi.string().valid('openrouter', 'azure').allow(null, ''),
  OPENROUTER_API_KEY: Joi.string().allow(null, ''),
  OPENROUTER_MODEL: Joi.string().allow(null, ''),
  AZURE_OPENAI_ENDPOINT: Joi.string().uri().allow(null, ''),
  AZURE_OPENAI_API_KEY: Joi.string().allow(null, ''),
  AZURE_OPENAI_DEPLOYMENT: Joi.string().allow(null, ''),
  AZURE_OPENAI_API_VERSION: Joi.string().allow(null, ''),
  // GDPR keeps Azure OpenAI inside the approved EU regions; validated here too, in case `AzureOpenAiProvider`'s check is bypassed.
  AZURE_OPENAI_REGION: Joi.string()
    .valid(...ALLOWED_AZURE_OPENAI_REGIONS)
    .allow(null, ''),
  ERASURE_GRACE_PERIOD_DAYS: Joi.number()
    .integer()
    .positive()
    .default(DEFAULT_ERASURE_GRACE_PERIOD_DAYS),
});
