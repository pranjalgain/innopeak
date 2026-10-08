import type { EnvConfig } from '@config/env.config';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IdTokenVerifier } from './id-token-verifier';
import {
  type MicrosoftAuthorizeParams,
  MicrosoftIdentityProvider,
  type MicrosoftTokenContext,
} from './microsoft-identity.provider';

import { MICROSOFT_AUTH } from '../constants/microsoft-auth.constants';
import type { SsoIdentity } from '../types/auth.type';

interface TokenResponse {
  id_token?: string;
}

/**
 * Microsoft's `email` claim is mutable and unverified in an Entra tenant (its administrator can set it
 * to anything), so it is trusted only alongside `xms_edov` — the "email domain owner verified" optional
 * claim, which the app registration must request (Token configuration → ID token). Without it every
 * identity comes back `emailVerified: false` and the callback refuses it. Microsoft documents the claim
 * as a boolean; a `1`/`"1"`/`"true"` form is accepted defensively.
 */
function isDomainVerified(claim: unknown): boolean {
  return claim === true || claim === 1 || claim === '1' || claim === 'true';
}

@Injectable()
export class MicrosoftOidcProvider extends MicrosoftIdentityProvider {
  private readonly logger = new Logger(MicrosoftOidcProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;
  private readonly authority: string;
  private readonly authorityBase: string;
  private readonly verifier: IdTokenVerifier;

  constructor(configService: ConfigService<EnvConfig>) {
    super();
    this.clientId = configService.get<string>('MICROSOFT_CLIENT_ID') ?? '';
    this.clientSecret = configService.get<string>('MICROSOFT_CLIENT_SECRET') ?? '';
    this.callbackUrl = configService.get<string>('MICROSOFT_CALLBACK_URL') ?? '';
    const authority = configService.get<string>('MICROSOFT_AUTHORITY');
    this.authority = (
      authority !== undefined && authority !== '' ? authority : MICROSOFT_AUTH.DEFAULT_AUTHORITY
    ).replace(/\/$/, '');
    // `https://login.microsoftonline.com/common` -> `https://login.microsoftonline.com`; the issuer
    // of a multi-tenant token is `<base>/<tid>/v2.0`.
    this.authorityBase = this.authority.replace(/\/[^/]+$/, '');
    this.verifier = new IdTokenVerifier(`${this.authority}${MICROSOFT_AUTH.JWKS_PATH}`);
  }

  isConfigured(): boolean {
    return this.clientId !== '' && this.clientSecret !== '' && this.callbackUrl !== '';
  }

  buildAuthorizationUrl(params: MicrosoftAuthorizeParams): string {
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      response_mode: 'query',
      scope: MICROSOFT_AUTH.SCOPES.join(' '),
      state: params.state,
      nonce: params.nonce,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    return `${this.authority}${MICROSOFT_AUTH.AUTHORIZE_PATH}?${query.toString()}`;
  }

  async fetchIdentity(code: string, context: MicrosoftTokenContext): Promise<SsoIdentity> {
    const response = await fetch(`${this.authority}${MICROSOFT_AUTH.TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        grant_type: 'authorization_code',
        code_verifier: context.codeVerifier,
        scope: MICROSOFT_AUTH.SCOPES.join(' '),
      }).toString(),
    });

    if (!response.ok) {
      // Body deliberately not logged: a failed exchange can echo the code or the client id.
      this.logger.warn(`Microsoft token exchange failed with ${response.status}`);
      throw new Error('Microsoft token exchange failed');
    }

    const token = (await response.json()) as TokenResponse;
    if (token.id_token === undefined || token.id_token === '') {
      throw new Error('Microsoft token exchange returned no ID token');
    }

    const claims = await this.verifier.verify(token.id_token, {
      audience: this.clientId,
      nonce: context.nonce,
      expectedIssuer: tokenClaims => `${this.authorityBase}/${tokenClaims.tid ?? ''}/v2.0`,
    });

    return {
      // `sub`: immutable and never reassigned. Not the email or `preferred_username`/`upn`, which
      // are mutable, and not `oid`, which differs per tenant for the same person.
      providerUserId: claims.sub as string,
      email: typeof claims.email === 'string' ? claims.email : '',
      emailVerified:
        typeof claims.email === 'string' &&
        claims.email !== '' &&
        isDomainVerified(claims.xms_edov),
      name: typeof claims.name === 'string' && claims.name !== '' ? claims.name : null,
    };
  }
}
