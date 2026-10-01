import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GoogleIdentityProvider } from './google-identity.provider';

import { GOOGLE_AUTH } from '../constants/google-auth.constants';
import type { GoogleIdentity } from '../types/auth.type';

interface TokenResponse {
  access_token?: string;
}

interface UserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/**
 * Real Google sign-in over OpenID Connect. Bare `fetch` rather than a passport strategy: the flow
 * is two HTTP calls, and a strategy would put the redirect and callback semantics inside passport
 * where the state/nonce/cookie handling this module needs cannot reach them.
 */
@Injectable()
export class GoogleOidcProvider extends GoogleIdentityProvider {
  private readonly logger = new Logger(GoogleOidcProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.clientId = configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    this.clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
    this.callbackUrl = configService.get<string>('GOOGLE_CALLBACK_URL') ?? '';
  }

  isConfigured(): boolean {
    return this.clientId !== '' && this.clientSecret !== '' && this.callbackUrl !== '';
  }

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      scope: GOOGLE_AUTH.SCOPES.join(' '),
      state,
      // Sign-in reads a profile once per round trip and stores no Google token, so there is
      // nothing to refresh — asking for offline access would collect a refresh token this feature
      // has no use for and would then have to protect.
      access_type: 'online',
      prompt: 'select_account',
    });

    return `${GOOGLE_AUTH.AUTH_URL}?${params.toString()}`;
  }

  async fetchIdentity(code: string): Promise<GoogleIdentity> {
    const tokenResponse = await fetch(GOOGLE_AUTH.TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      // Body deliberately not logged: a failed exchange echoes the code, and on some errors the
      // client_id, into the message.
      this.logger.warn(`Google token exchange failed with ${tokenResponse.status}`);
      throw new Error('Google token exchange failed');
    }

    const token = (await tokenResponse.json()) as TokenResponse;
    if (token.access_token === undefined || token.access_token === '') {
      throw new Error('Google token exchange returned no access token');
    }

    const userInfoResponse = await fetch(GOOGLE_AUTH.USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!userInfoResponse.ok) {
      this.logger.warn(`Google userinfo failed with ${userInfoResponse.status}`);
      throw new Error('Google userinfo request failed');
    }

    const profile = (await userInfoResponse.json()) as UserInfoResponse;
    if (profile.sub === undefined || profile.email === undefined) {
      throw new Error('Google userinfo returned no subject or email');
    }

    return {
      providerUserId: profile.sub,
      email: profile.email,
      emailVerified: profile.email_verified === true,
      name: profile.name !== undefined && profile.name !== '' ? profile.name : null,
    };
  }
}
