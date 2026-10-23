import type { SsoIdentity } from '../types/auth.type';

export interface GoogleAuthorizeParams {
  /** Already signed by the caller. */
  state: string;
  /** S256 PKCE challenge; absent only for a caller that did not ask for PKCE. */
  codeChallenge?: string;
}

export interface GoogleTokenContext {
  /** The verifier whose challenge went out with the authorization request; sent only when there was one. */
  codeVerifier?: string;
}

export abstract class GoogleIdentityProvider {
  /** False when the client is unconfigured; the routes answer 503 rather than failing at boot. */
  abstract isConfigured(): boolean;

  abstract buildAuthorizationUrl(params: GoogleAuthorizeParams): string;

  /**
   * Exchanges the one-time `code` for a profile. Throws on any provider failure — the caller maps
   * that to a `PROVIDER_ERROR` redirect, since the browser is mid-navigation and cannot render a
   * JSON error.
   */
  abstract fetchIdentity(code: string, context?: GoogleTokenContext): Promise<SsoIdentity>;
}
