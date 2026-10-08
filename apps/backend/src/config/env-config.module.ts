import { JWT_SECRET_MIN_LENGTH } from '@auth/constants/auth.constants';
import { DEFAULT_ERASURE_GRACE_PERIOD_DAYS } from '@common/constants/erasure.constants';
import { EnvConfig } from '@config/env.config';
import { Module } from '@nestjs/common';
import { ConfigModule, registerAs } from '@nestjs/config';
import * as Joi from 'joi';

const envConfig = registerAs(
  'env',
  (): EnvConfig =>
    ({
      PORT: parseInt(process.env['PORT'] ?? '3000', 10),
      // No default: an unset NODE_ENV read as 'development' would silently enable the DEV_* bypasses and
      // drop the Secure flag from session cookies; Joi requires it so boot fails loudly instead.
      NODE_ENV: process.env['NODE_ENV'] ?? '',
      CORS_ORIGINS: process.env['CORS_ORIGINS'] ?? '*',
      PROMETHEUS_PORT: parseInt(process.env['PROMETHEUS_PORT'] ?? '9090', 10),
      PROMETHEUS_PUSH_GATEWAY_PORT: parseInt(
        process.env['PROMETHEUS_PUSH_GATEWAY_PORT'] ?? '9091',
        10
      ),
      PROMTAIL_PORT: parseInt(process.env['PROMTAIL_PORT'] ?? '9080', 10),
      NODE_EXPORTER_PORT: parseInt(process.env['NODE_EXPORTER_PORT'] ?? '9100', 10),
      NODE_EXPORTER_TARGET: process.env['NODE_EXPORTER_TARGET'] ?? '',
      NESTJS_METRICS_TARGET: process.env['NESTJS_METRICS_TARGET'] ?? '',
      GRAFANA_PORT: parseInt(process.env['GRAFANA_PORT'] ?? '3001', 10),
      GRAFANA_ADMIN_PASSWORD: process.env['GRAFANA_ADMIN_PASSWORD'] ?? '',
      LOKI_PORT: parseInt(process.env['LOKI_PORT'] ?? '3100', 10),
      LOKI_API_TOKEN: process.env['LOKI_API_TOKEN'] ?? '',
      OTLP_PORT: parseInt(process.env['OTLP_PORT'] ?? '4317', 10),
      OTEL_SERVICE_NAME: process.env['OTEL_SERVICE_NAME'] ?? '',
      OTEL_EXPORTER_OTLP_ENDPOINT: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? '',
      JAEGER_PORT: parseInt(process.env['JAEGER_PORT'] ?? '16686', 10),
      JAEGER_COLLECTOR_PORT: parseInt(process.env['JAEGER_COLLECTOR_PORT'] ?? '14268', 10),
      JAGER_URL: process.env['JAGER_URL'] ?? '',
      REDIS_HOST: process.env['REDIS_HOST'] ?? '',
      REDIS_PORT: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
      REDIS_PASSWORD: process.env['REDIS_PASSWORD'] ?? '',
      REDIS_TLS_ENABLED: (process.env['REDIS_TLS_ENABLED'] ?? 'false').toLowerCase() === 'true',
      POSTGRES_DB: process.env['POSTGRES_DB'] ?? 'postgres',
      POSTGRES_USER: process.env['POSTGRES_USER'] ?? 'postgres',
      POSTGRES_PASSWORD: process.env['POSTGRES_PASSWORD'] ?? 'postgres',
      POSTGRES_HOST: process.env['POSTGRES_HOST'] ?? '127.0.0.1',
      POSTGRES_PORT: parseInt(process.env['POSTGRES_PORT'] ?? '5432', 10),
      DATABASE_URL: ((): string => {
        const dbUrl = process.env['DATABASE_URL'];
        if (dbUrl?.includes('${')) {
          return `postgresql://${process.env['POSTGRES_USER'] ?? 'postgres'}:${process.env['POSTGRES_PASSWORD'] ?? 'postgres'}@${process.env['POSTGRES_HOST'] ?? '127.0.0.1'}:${process.env['POSTGRES_PORT'] ?? '5432'}/${process.env['POSTGRES_DB'] ?? 'postgres'}`;
        }
        return (
          dbUrl ??
          `postgresql://${process.env['POSTGRES_USER'] ?? 'postgres'}:${process.env['POSTGRES_PASSWORD'] ?? 'postgres'}@${process.env['POSTGRES_HOST'] ?? '127.0.0.1'}:${process.env['POSTGRES_PORT'] ?? '5432'}/${process.env['POSTGRES_DB'] ?? 'postgres'}`
        );
      })(),
      DEFAULT_PAGE: parseInt(process.env['DEFAULT_PAGE'] ?? '1', 10),
      DEFAULT_PAGE_SIZE: parseInt(process.env['DEFAULT_PAGE_SIZE'] ?? '10', 10),
      GRAFANA_URL: process.env['GRAFANA_URL'] ?? '',
      APP_LOGS_URL: process.env['APP_LOGS_URL'] ?? '',
      DEV_DOCS_URL: process.env['DEV_DOCS_URL'] ?? '',
      SERVICES_HEALTH_URL: process.env['SERVICES_HEALTH_URL'] ?? '',
      FRONTEND_URL: process.env['FRONTEND_URL'] ?? '',
      VERIFY_EMAIL_OTP_TTL_MINUTES: parseInt(
        process.env['VERIFY_EMAIL_OTP_TTL_MINUTES'] ?? '10',
        10
      ),
      TRUST_PROXY_HOPS: parseInt(process.env['TRUST_PROXY_HOPS'] ?? '0', 10),
      DEV_VERIFY_EMAIL_TOKEN: process.env['DEV_VERIFY_EMAIL_TOKEN'],
      JWT_SECRET: process.env['JWT_SECRET'] ?? '',
      JWT_REFRESH_SECRET: process.env['JWT_REFRESH_SECRET'],
      GOOGLE_AUTH_STATE_SECRET: process.env['GOOGLE_AUTH_STATE_SECRET'],
      DEV_GOOGLE_AUTH_MOCK: process.env['DEV_GOOGLE_AUTH_MOCK'],
      DEV_GOOGLE_AUTH_MOCK_EMAIL: process.env['DEV_GOOGLE_AUTH_MOCK_EMAIL'],
      GBP_CLIENT_ID: process.env['GBP_CLIENT_ID'],
      GBP_CLIENT_SECRET: process.env['GBP_CLIENT_SECRET'],
      GBP_CALLBACK_URL: process.env['GBP_CALLBACK_URL'],
      GBP_STATE_SECRET: process.env['GBP_STATE_SECRET'],
      CREDENTIAL_ENCRYPTION_KEY: process.env['CREDENTIAL_ENCRYPTION_KEY'],
      DEV_GBP_MOCK: process.env['DEV_GBP_MOCK'],
      DEV_GBP_MOCK_ACCOUNT_ID: process.env['DEV_GBP_MOCK_ACCOUNT_ID'],
      ERASURE_GRACE_PERIOD_DAYS: parseInt(
        process.env['ERASURE_GRACE_PERIOD_DAYS'] ?? String(DEFAULT_ERASURE_GRACE_PERIOD_DAYS),
        10
      ),
    }) as EnvConfig
);

// Placeholder secrets from `.env.example` pass every other check (long enough, distinct), so a deploy that only sets
// `NODE_ENV=production` would boot on values public in git, letting anyone forge an HS256 token (`JwtStrategy.validate`
// does no DB lookup), including `type: platform_admin`. Production refuses to boot on one; other environments warn.
// Matched by the tell-tale phrase, not an exact list, so a half-edited copy is still caught.
const SECRET_PLACEHOLDER_MARKER = 'change-in-production';

function looksLikePlaceholderSecret(value: string | undefined): boolean {
  if (!value) return false;
  if (value.toLowerCase().includes(SECRET_PLACEHOLDER_MARKER)) return true;

  // `CREDENTIAL_ENCRYPTION_KEY` is base64, so its placeholder never contains the marker in encoded form (base64 has no
  // hyphen); decoding first lets one check cover both. `Buffer.from(..., 'base64')` never throws on non-base64 input.
  const decoded = Buffer.from(value, 'base64').toString('utf8').toLowerCase();
  return decoded.includes(SECRET_PLACEHOLDER_MARKER);
}

{
  const placeholderKeys = (
    [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'GOOGLE_AUTH_STATE_SECRET',
      'GBP_STATE_SECRET',
      // Must be listed: a shipped base64 placeholder otherwise passes into production unnoticed.
      'CREDENTIAL_ENCRYPTION_KEY',
    ] as const
  ).filter(key => looksLikePlaceholderSecret(process.env[key]));

  if (placeholderKeys.length > 0) {
    const message =
      `Refusing the shipped placeholder value for: ${placeholderKeys.join(', ')}. ` +
      'These are public in .env.example — generate real secrets, e.g. `openssl rand -base64 48`.';
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(message);
    }
    // eslint-disable-next-line no-console -- runs at module-eval, before the Nest logger exists
    console.warn(`[env] WARNING: ${message}`);
  }
}

// DEV_VERIFY_EMAIL_TOKEN's production ban is enforced by Joi alone; JWT_REFRESH_SECRET needs a manual check because
// Joi can't express "must differ from another key's value".

// Identical secrets in production would let a leaked access token be replayed as a refresh token. The JWT_SECRET fallback is local-dev only.
if (
  process.env['NODE_ENV'] === 'production' &&
  (!process.env['JWT_REFRESH_SECRET'] ||
    process.env['JWT_REFRESH_SECRET'] === process.env['JWT_SECRET'])
) {
  throw new Error(
    'JWT_REFRESH_SECRET must be set to a value different from JWT_SECRET in production.'
  );
}

// GBP_STATE_SECRET: the OAuth `state` blob proves we minted a consent URL, so an unsigned one lets an attacker mint one
// naming their own tenant; a missing key would silently sign with an empty string. Production only: local dev has a fallback.
if (process.env['NODE_ENV'] === 'production' && !process.env['GBP_STATE_SECRET']) {
  throw new Error('GBP_STATE_SECRET must be set in production.');
}

// Google sign-in OAuth state (`OAuthStateService`): a missing var would silently sign with JWT_SECRET instead.
// It need not differ from JWT_SECRET: it only signs an anti-replay nonce, never a JWT with a `type` claim.
if (process.env['NODE_ENV'] === 'production' && !process.env['GOOGLE_AUTH_STATE_SECRET']) {
  throw new Error('GOOGLE_AUTH_STATE_SECRET must be set in production.');
}

const validationSchema = Joi.object({
  PORT: Joi.number().port().required(),
  NODE_ENV: Joi.string().valid('development', 'production').required(),
  CORS_ORIGINS: Joi.string().required().disallow(null, ''),
  PROMETHEUS_PORT: Joi.number().port().allow(null, 9090),
  PROMETHEUS_PUSH_GATEWAY_PORT: Joi.number().port().allow(null, 9091),
  PROMTAIL_PORT: Joi.number().port().allow(null, 9080),
  NODE_EXPORTER_PORT: Joi.number().port().allow(null, 9100),
  NODE_EXPORTER_TARGET: Joi.string().allow(null, '127.0.0.1:3000'),
  NESTJS_METRICS_TARGET: Joi.string().allow(null, 'node-exporter:9100'),
  GRAFANA_PORT: Joi.number().port().allow(null),
  GRAFANA_ADMIN_PASSWORD: Joi.string().allow(null, ''),
  LOKI_PORT: Joi.when('NODE_ENV', {
    is: 'development',
    then: Joi.number().port().required(),
    otherwise: Joi.number().port().allow(null),
  }),
  LOKI_API_TOKEN: Joi.when('NODE_ENV', {
    is: 'development',
    then: Joi.string().required(),
    otherwise: Joi.string().allow(null, ''),
  }),
  OTLP_PORT: Joi.number().port().allow(null, 4318),
  OTEL_SERVICE_NAME: Joi.string().required(),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string().uri().required(),
  JAEGER_PORT: Joi.number().port().allow(null, 16686),
  JAEGER_COLLECTOR_PORT: Joi.number().port().allow(null, 14268),
  JAGER_URL: Joi.string().uri().allow(null, 'http://localhost:16686'),
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
  GRAFANA_URL: Joi.string().required(),
  APP_LOGS_URL: Joi.string().required(),
  DEV_DOCS_URL: Joi.string().required(),
  SERVICES_HEALTH_URL: Joi.string().required(),
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
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
  // Optional like FRONTEND_URL: developers not working on connections have none set; the routes that need them answer 503 (see GoogleBusinessProfileProvider).
  GOOGLE_AUTH_STATE_SECRET: Joi.string().allow(null, ''),
  // Forbidden in production, mirroring DEV_VERIFY_EMAIL_TOKEN: a mocked sign-in must never ship.
  DEV_GOOGLE_AUTH_MOCK: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().valid('true', 'false').allow(null, ''),
  }),
  DEV_GOOGLE_AUTH_MOCK_EMAIL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().allow(null, ''),
  }),
  MICROSOFT_CLIENT_ID: Joi.string().allow(null, ''),
  MICROSOFT_CLIENT_SECRET: Joi.string().allow(null, ''),
  MICROSOFT_CALLBACK_URL: Joi.string().uri().allow(null, ''),
  MICROSOFT_AUTHORITY: Joi.string().uri().allow(null, ''),
  // Forbidden in production, like DEV_GOOGLE_AUTH_MOCK: a mocked sign-in must never ship.
  DEV_MICROSOFT_AUTH_MOCK: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().valid('true', 'false').allow(null, ''),
  }),
  DEV_MICROSOFT_AUTH_MOCK_EMAIL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().allow(null, ''),
  }),
  GBP_CLIENT_ID: Joi.string().allow(null, ''),
  GBP_CLIENT_SECRET: Joi.string().allow(null, ''),
  GBP_CALLBACK_URL: Joi.string().uri().allow(null, ''),
  // "Must be set in production" is the manual check above, keeping both halves of the secret rules in one place.
  GBP_STATE_SECRET: Joi.string().allow(null, ''),
  CREDENTIAL_ENCRYPTION_KEY: Joi.string().base64().allow(null, ''),
  // Forbidden in production like DEV_VERIFY_EMAIL_TOKEN: a connection with fixture reviews is indistinguishable from a real one in the DB.
  DEV_GBP_MOCK: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().valid('true', 'false').allow(null, ''),
  }),
  DEV_GBP_MOCK_ACCOUNT_ID: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().allow(null, ''),
  }),
  // Forbidden in production like DEV_GBP_MOCK: redirecting at a local emulator must never be possible there.
  USE_LOCAL_MOCK_SERVER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().valid('true', 'false').allow(null, ''),
  }),
  LOCAL_MOCK_SERVER_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().uri().allow(null, ''),
  }),
  PAYMENT_FEATURE_ENABLED: Joi.string().valid('true', 'false').allow(null, ''),
  // Required outright in production, not just forbidden-dummy: `/v1/billing/dummy/complete-checkout` flips any tenant to
  // `paid` and is gated only by `paymentProvider.type === 'dummy'` (not PAYMENT_FEATURE_ENABLED), and `BillingModule`'s
  // factory defaults to `dummy`, so a forgotten value would allow free upgrades.
  PAYMENT_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('stripe').required(),
    otherwise: Joi.string().valid('dummy', 'stripe').allow(null, ''),
  }),
  // Required whenever PAYMENT_PROVIDER=stripe, in every environment: without the webhook secret
  // `StripePaymentProvider` defaults to an empty string and rejects every real delivery with no boot-time signal.
  STRIPE_SECRET_KEY: Joi.when('PAYMENT_PROVIDER', {
    is: 'stripe',
    then: Joi.string().required(),
    otherwise: Joi.string().allow(null, ''),
  }),
  STRIPE_WEBHOOK_SECRET: Joi.when('PAYMENT_PROVIDER', {
    is: 'stripe',
    then: Joi.string().required(),
    otherwise: Joi.string().allow(null, ''),
  }),
  STRIPE_PRICE_ID_PAID: Joi.string().allow(null, ''),
  // Optional in every environment, unlike PAYMENT_PROVIDER: providers validate their own config lazily on first call
  // (a missing key fails that generation with `AiProviderNotConfiguredException`, not app startup), like `STORAGE_PROVIDER`.
  AI_PROVIDER: Joi.string().valid('openrouter', 'azure').allow(null, ''),
  OPENROUTER_API_KEY: Joi.string().allow(null, ''),
  OPENROUTER_MODEL: Joi.string().allow(null, ''),
  AZURE_OPENAI_ENDPOINT: Joi.string().uri().allow(null, ''),
  AZURE_OPENAI_API_KEY: Joi.string().allow(null, ''),
  AZURE_OPENAI_DEPLOYMENT: Joi.string().allow(null, ''),
  AZURE_OPENAI_API_VERSION: Joi.string().allow(null, ''),
  // GDPR requires westeurope for Azure OpenAI; validated here too, in case `AzureOpenAiProvider`'s constructor check is bypassed.
  AZURE_OPENAI_REGION: Joi.string().valid('westeurope').allow(null, ''),
  ERASURE_GRACE_PERIOD_DAYS: Joi.number()
    .integer()
    .positive()
    .default(DEFAULT_ERASURE_GRACE_PERIOD_DAYS),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
      validationSchema,
    }),
  ],
  exports: [ConfigModule],
})
export class EnvConfigModule {}
