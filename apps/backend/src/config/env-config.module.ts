import { EnvConfig } from '@config/env.config';
import { Module } from '@nestjs/common';
import { ConfigModule, registerAs } from '@nestjs/config';
import * as Joi from 'joi';

const envConfig = registerAs(
  'env',
  (): EnvConfig =>
    ({
      PORT: parseInt(process.env['PORT'] ?? '3000', 10),
      NODE_ENV: process.env['NODE_ENV'] ?? 'development',
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
        // If DATABASE_URL contains template variables, construct it from individual components
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
    }) as EnvConfig
);

// DEV_VERIFY_EMAIL_TOKEN's "never in production" rule is enforced by the Joi schema alone
// (DEV_VERIFY_EMAIL_TOKEN: Joi.when(...).then(Joi.forbidden()) below) — no separate manual check
// needed here, unlike JWT_REFRESH_SECRET just below, which has no Joi equivalent at all (Joi has
// no built-in way to express "required and must differ from another key's value").

// JWT_REFRESH_SECRET falling back to JWT_SECRET is a local-dev convenience only — if the two
// secrets are identical in production, a leaked access token can be replayed as a refresh token,
// which is the exact thing having a separate secret is for. See the auth API reference's
// Configuration section.
if (
  process.env['NODE_ENV'] === 'production' &&
  (!process.env['JWT_REFRESH_SECRET'] ||
    process.env['JWT_REFRESH_SECRET'] === process.env['JWT_SECRET'])
) {
  throw new Error(
    'JWT_REFRESH_SECRET must be set to a value different from JWT_SECRET in production.'
  );
}

// GBP_STATE_SECRET has the same "Joi can't express this" shape as JWT_REFRESH_SECRET: the OAuth
// `state` blob is what proves *we* minted a consent URL, and an unsigned or default-signed state
// lets an attacker mint one naming their own tenant and mail it to a victim business owner. A
// missing key would otherwise degrade silently to "sign with an empty string", which is not
// signing. Only enforced in production because local dev has a documented fallback.
if (process.env['NODE_ENV'] === 'production' && !process.env['GBP_STATE_SECRET']) {
  throw new Error('GBP_STATE_SECRET must be set in production.');
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
  // Regex validation for PostgreSQL connection string
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
  // Optional on purpose: nothing under src/ reads it yet (it's reserved for OAuth/redirect
  // URLs), so requiring it would hard-fail boot in every environment that hasn't set it.
  FRONTEND_URL: Joi.string().uri().allow(null, '').optional(),
  VERIFY_EMAIL_OTP_TTL_MINUTES: Joi.number().integer().positive().default(10),
  DEV_VERIFY_EMAIL_TOKEN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden(),
    otherwise: Joi.string().allow(null, ''),
  }),
  JWT_SECRET: Joi.string().required(),
  // Cross-field "must differ from JWT_SECRET in production" isn't expressible in Joi without a
  // custom validator — enforced by the manual check above instead. Falling back to JWT_SECRET in
  // non-production is a local-dev convenience only.
  JWT_REFRESH_SECRET: Joi.string().allow(null, ''),
  // Optional for the same reason FRONTEND_URL is: a developer not working on the connections
  // module has none of these set, and hard-failing boot for everyone else would be hostile. The
  // routes that need them answer 503 instead — see GoogleBusinessProfileProvider.
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
  GBP_CLIENT_ID: Joi.string().allow(null, ''),
  GBP_CLIENT_SECRET: Joi.string().allow(null, ''),
  GBP_CALLBACK_URL: Joi.string().uri().allow(null, ''),
  // "must be set in production" is the manual check above — Joi.when can express it, but keeping
  // both halves of the secret rules in one place beats splitting them across two mechanisms.
  GBP_STATE_SECRET: Joi.string().allow(null, ''),
  CREDENTIAL_ENCRYPTION_KEY: Joi.string().base64().allow(null, ''),
  // Same rule as DEV_VERIFY_EMAIL_TOKEN above, for the same reason: a connection whose reviews are
  // fixtures is indistinguishable from a real one in the database, so production must not be able
  // to create one even by accident.
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
