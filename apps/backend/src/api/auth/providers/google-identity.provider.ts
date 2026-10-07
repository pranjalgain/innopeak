import type { GoogleIdentity } from '../types/auth.type';

export abstract class GoogleIdentityProvider {
  /** False when the client is unconfigured; the routes answer 503 rather than failing at boot. */
  abstract isConfigured(): boolean;

  /** `state` is already signed by the caller. */
  abstract buildAuthorizationUrl(state: string): string;

  /**
   * Exchanges the one-time `code` for a profile. Throws on any provider failure — the caller maps
   * that to a `PROVIDER_ERROR` redirect, since the browser is mid-navigation and cannot render a
   * JSON error.
   */
  abstract fetchIdentity(code: string): Promise<GoogleIdentity>;
}
