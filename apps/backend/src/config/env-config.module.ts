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
      // No default: an unset NODE_ENV previously read as 'development', which silently
      // enables the DEV_* bypasses and drops the Secure flag from every session cookie.
      // Joi requires it below, so boot fails loudly instead.
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

// Placeholder secrets shipped in `.env.example` clear every other check — they are long enough
// (≥32) and differ from each other — so a deploy that copies the example and sets only
// `NODE_ENV=production` used to boot on values that are public in git. Anyone could then forge an
// HS256 token for any account (`JwtStrategy.validate` trusts the claims and does no DB lookup),
// including `type: platform_admin` for the whole `/v1/admin/*` surface. This is a full auth
// bypass, so production refuses to boot on any recognizably-placeholder secret; other environments
// warn loudly rather than fail, since local dev deliberately ships usable defaults.
//
// Matched by the tell-tale phrase every shipped placeholder carries, not an exact list, so a
// half-edited copy ("prod-change-in-production-xyz") is still caught. Nothing that is actually
// random will contain it.
const SECRET_PLACEHOLDER_MARKER = 'change-in-production';

function looksLikePlaceholderSecret(value: string | undefined): boolean {
  if (!value) return false;
  if (value.toLowerCase().includes(SECRET_PLACEHOLDER_MARKER)) return true;

  // `CREDENTIAL_ENCRYPTION_KEY` is base64-encoded, so its shipped placeholder can never contain
  // the marker in its *encoded* form — base64's alphabet has no hyphen, and the marker has three.
  // Decoding first lets one check cover both plain-text and base64 secrets, rather than needing a
  // separate, easy-to-forget special case for the latter. `Buffer.from(..., 'base64')` is lenient
  // (never throws on non-base64 input), and real random key bytes interpreted as UTF-8 are
  // overwhelmingly unlikely to coincidentally contain this exact phrase, so this adds no realistic
  // false-positive risk for an actual generated secret.
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
      // Encrypts provider refresh tokens at rest (LocalRedisCredentialStoreProvider) — missing
      // from this list entirely used to mean a shipped base64 blob that merely *looks* like real
      // key material passed silently into production, with no substring for this check to catch.
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

// Same shape again, for the Google sign-in/sign-up OAuth state (GoogleOAuthStateService, distinct
// from GBP_STATE_SECRET's Business Profile connection flow above). Without this check, a missing
// env var doesn't fail — it silently signs with JWT_SECRET instead (a different secret meant for a
// different job), and nothing today would ever surface that a production deploy is doing so. Not
// required to differ from JWT_SECRET the way JWT_REFRESH_SECRET is: this secret only signs an
// anti-replay nonce, never a JWT with a `type` claim, so sharing it doesn't enable the
// token-forgery escalation that rule exists to prevent.
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
  // HS256's strength is bounded by the secret's entropy: a short one is brute-forceable offline
  // from any single captured token, after which anyone can mint tokens for any account.
  JWT_SECRET: Joi.string().min(JWT_SECRET_MIN_LENGTH).required(),
  // Cross-field "must differ from JWT_SECRET in production" isn't expressible in Joi without a
  // custom validator — enforced by the manual check above instead. Falling back to JWT_SECRET in
  // non-production is a local-dev convenience only.
  JWT_REFRESH_SECRET: Joi.string().min(JWT_SECRET_MIN_LENGTH).allow(null, ''),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
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
  PAYMENT_FEATURE_ENABLED: Joi.string().valid('true', 'false').allow(null, ''),
  // Unlike the DEV_* flags above, this isn't only gated by PAYMENT_FEATURE_ENABLED: the Dummy
  // provider's `/v1/billing/dummy/complete-checkout` route flips any tenant to `paid` on nothing
  // but the caller's own say-so (`BillingService.completeDummyCheckout`), checked only against
  // `paymentProvider.type === 'dummy'` — not against whether billing itself is "enabled". A
  // production deploy that forgets to set this to `stripe` (it defaults to `dummy` in
  // `BillingModule`'s own factory) would silently accept free upgrades through that route even
  // with billing otherwise switched off. Required outright in production, not merely forbidden
  // from being `dummy`, so a typo can't slip through as an unvalidated unknown value either.
  PAYMENT_PROVIDER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('stripe').required(),
    otherwise: Joi.string().valid('dummy', 'stripe').allow(null, ''),
  }),
  // Required whenever PAYMENT_PROVIDER=stripe, in every environment (not just production) — a
  // stripe deploy with no secret key can't call the Stripe API at all, and one with no webhook
  // secret has `StripePaymentProvider.constructWebhookEvent` silently defaulting to an empty
  // string and rejecting every real webhook delivery with no boot-time signal that anything is
  // wrong (see that provider's own constructor).
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
  // Deliberately optional in every environment, unlike PAYMENT_PROVIDER above: nothing in the
  // product calls `AiReplyGenerationService` yet (dry-run testing only — see
  // apps/documentation/docs/backend/ai/overview.md), so there is no live path a missing/typo'd
  // value could silently break. `OpenRouterAiProvider` validates its own required config lazily,
  // on the first real call, rather than at boot. Revisit once generation is wired into the
  // classification pipeline and becomes load-bearing, the same way PAYMENT_PROVIDER is.
  AI_PROVIDER: Joi.string().valid('openrouter').allow(null, ''),
  OPENROUTER_API_KEY: Joi.string().allow(null, ''),
  OPENROUTER_MODEL: Joi.string().allow(null, ''),
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
