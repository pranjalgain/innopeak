import type { SsoIdentity } from '../types/auth.type';

export interface MicrosoftAuthorizeParams {
  /** Already signed by the caller. */
  state: string;
  /** The OIDC `nonce`; the ID token must echo it. */
  nonce: string;
  /** S256 PKCE challenge. */
  codeChallenge: string;
}

export interface MicrosoftTokenContext {
  codeVerifier: string;
  nonce: string;
}

export abstract class MicrosoftIdentityProvider {
  /** False when the client is unconfigured; the routes redirect with `NOT_CONFIGURED` rather than failing at boot. */
  abstract isConfigured(): boolean;

  abstract buildAuthorizationUrl(params: MicrosoftAuthorizeParams): string;

  /**
   * Exchanges the one-time `code` and returns the identity from a *validated* ID token. Throws on any
   * provider or validation failure; the caller maps that to a `PROVIDER_ERROR` redirect.
   */
  abstract fetchIdentity(code: string, context: MicrosoftTokenContext): Promise<SsoIdentity>;
}
