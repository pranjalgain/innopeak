import { DEFAULT_ERASURE_GRACE_PERIOD_DAYS } from '@common/constants/erasure.constants';
import { EnvConfig } from '@config/env.config';
import { Module } from '@nestjs/common';
import { ConfigModule, registerAs } from '@nestjs/config';

import { validationSchema } from './env-config.schema';

const envConfig = registerAs(
  'env',
  (): EnvConfig =>
    ({
      PORT: parseInt(process.env['PORT'] ?? '3000', 10),
      // No default: an unset NODE_ENV read as 'development' would silently enable the DEV_* bypasses and
      // drop the Secure flag from session cookies; Joi requires it so boot fails loudly instead.
      NODE_ENV: process.env['NODE_ENV'] ?? '',
      CORS_ORIGINS: process.env['CORS_ORIGINS'] ?? '*',
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
      GBP_CLIENT_ID: process.env['GBP_CLIENT_ID'],
      GBP_CLIENT_SECRET: process.env['GBP_CLIENT_SECRET'],
      GBP_CALLBACK_URL: process.env['GBP_CALLBACK_URL'],
      GBP_STATE_SECRET: process.env['GBP_STATE_SECRET'],
      CREDENTIAL_ENCRYPTION_KEY: process.env['CREDENTIAL_ENCRYPTION_KEY'],
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
