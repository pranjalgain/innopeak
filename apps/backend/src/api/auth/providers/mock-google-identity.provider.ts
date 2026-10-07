import type { EnvConfig } from '@config/env.config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GoogleIdentityProvider } from './google-identity.provider';

import type { GoogleIdentity } from '../types/auth.type';

/**
 * Dev-only (`DEV_GOOGLE_AUTH_MOCK=true`, Joi-forbidden in production). Does not bypass the callback:
 * the authorization URL bounces back with the real signed `state`, so state/nonce/cookie checks run
 * for real and only the profile is fabricated. Email derives from the nonce so signups don't collide.
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
      providerUserId: `mock-google-sub-${seed}`,
      email,
      emailVerified: true,
      name: 'Dev Google User',
    });
  }
}
