import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  type GoogleAuthorizeParams,
  GoogleIdentityProvider,
  type GoogleTokenContext,
} from './google-identity.provider';

import { GOOGLE_AUTH } from '../constants/google-auth.constants';
import type { SsoIdentity } from '../types/auth.type';

interface TokenResponse {
  access_token?: string;
}

interface UserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

// Bare `fetch` instead of a passport strategy: passport would hide the redirect/callback where
// this module's state/nonce/cookie handling cannot reach it.
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

  buildAuthorizationUrl(authorize: GoogleAuthorizeParams): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      scope: GOOGLE_AUTH.SCOPES.join(' '),
      state: authorize.state,
      // Online: no Google token is stored, so an offline refresh token would be one we'd have to protect for nothing.
      access_type: 'online',
      prompt: 'select_account',
    });
    // PKCE binds the code to this server's request: a code injected into another browser's callback cannot be redeemed without the
    // verifier, which never leaves the Redis record.
    if (authorize.codeChallenge !== undefined) {
      params.set('code_challenge', authorize.codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${GOOGLE_AUTH.AUTH_URL}?${params.toString()}`;
  }

  async fetchIdentity(code: string, context: GoogleTokenContext = {}): Promise<SsoIdentity> {
    const tokenResponse = await fetch(GOOGLE_AUTH.TOKEN_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(GOOGLE_AUTH.HTTP_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        grant_type: 'authorization_code',
        ...(context.codeVerifier === undefined ? {} : { code_verifier: context.codeVerifier }),
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
      signal: AbortSignal.timeout(GOOGLE_AUTH.HTTP_TIMEOUT_MS),
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
