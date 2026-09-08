import type { EnvConfig } from '@config/env.config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GoogleIdentityProvider } from './google-identity.provider';

import type { GoogleIdentity } from '../types/google-identity.type';

/**
 * Dev-only stand-in, selected when `DEV_GOOGLE_AUTH_MOCK=true` (Joi-forbidden in production, the
 * same guard `DEV_VERIFY_EMAIL_TOKEN` uses).
 *
 * It does **not** bypass the callback. `buildAuthorizationUrl` returns our own callback URL
 * carrying the real signed `state` and a synthetic code, so the browser bounces straight back into
 * `/v1/auth/google/callback` and state verification, nonce consume-once, the cookie check, and the
 * account resolution all run for real — with no Google. Only the profile is fabricated.
 *
 * The email is derived from the nonce so repeated signups do not collide, while re-entering the
 * same round trip twice yields the same person.
 */
@Injectable()
export class MockGoogleIdentityProvider extends GoogleIdentityProvider {
  private readonly callbackUrl: string;
  private readonly fixedEmail: string;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.callbackUrl =
      configService.get<string>('GOOGLE_CALLBACK_URL') ??
      'http://localhost:3002/v1/auth/google/callback';
    this.fixedEmail = configService.get<string>('DEV_GOOGLE_AUTH_MOCK_EMAIL') ?? '';
  }

  isConfigured(): boolean {
    return true;
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({ code: `mock-code:${state}`, state });
    return `${this.callbackUrl}?${params.toString()}`;
  }

  fetchIdentity(code: string): Promise<GoogleIdentity> {
    const seed = code.replace(/^mock-code:/, '').slice(0, 12) || 'devuser';
    const email =
      this.fixedEmail !== '' ? this.fixedEmail : `google.${seed.toLowerCase()}@example.com`;

    return Promise.resolve({
      // Stable per seed, so a repeat of the same round trip resolves to the same identity.
      providerUserId: `mock-google-sub-${seed}`,
      email,
      emailVerified: true,
      name: 'Dev Google User',
    });
  }
}
