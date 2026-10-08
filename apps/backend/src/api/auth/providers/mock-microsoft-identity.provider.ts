import type { EnvConfig } from '@config/env.config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  type MicrosoftAuthorizeParams,
  MicrosoftIdentityProvider,
  type MicrosoftTokenContext,
} from './microsoft-identity.provider';

import type { SsoIdentity } from '../types/auth.type';

/**
 * Dev-only (`DEV_MICROSOFT_AUTH_MOCK=true`, Joi-forbidden in production). Does not bypass the
 * callback: the authorization URL bounces straight back with the real signed `state`, so state,
 * browser-binding and single-use checks run for real and only the identity is fabricated. Email
 * derives from the state so signups don't collide. For the real token handling use the mock
 * authority in `apps/mock-external-apis` instead.
 */
@Injectable()
export class MockMicrosoftIdentityProvider extends MicrosoftIdentityProvider {
  private readonly callbackUrl: string;
  private readonly fixedEmail: string;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.callbackUrl =
      configService.get<string>('MICROSOFT_CALLBACK_URL') ??
      'http://localhost:3002/v1/auth/microsoft/callback';
    this.fixedEmail = configService.get<string>('DEV_MICROSOFT_AUTH_MOCK_EMAIL') ?? '';
  }

  isConfigured(): boolean {
    return true;
  }

  buildAuthorizationUrl(params: MicrosoftAuthorizeParams): string {
    const query = new URLSearchParams({ code: `mock-code:${params.state}`, state: params.state });
    return `${this.callbackUrl}?${query.toString()}`;
  }

  fetchIdentity(code: string, _context: MicrosoftTokenContext): Promise<SsoIdentity> {
    const seed = code.replace(/^mock-code:/, '').slice(0, 12) || 'devuser';
    const email =
      this.fixedEmail !== '' ? this.fixedEmail : `microsoft.${seed.toLowerCase()}@example.com`;

    return Promise.resolve({
      providerUserId: `mock-microsoft-sub-${seed}`,
      email,
      emailVerified: true,
      name: 'Dev Microsoft User',
    });
  }
}
