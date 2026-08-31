import { Injectable } from '@nestjs/common';

export interface AppleOAuthUser {
  provider: 'apple';
  providerId: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Apple Sign-In OAuth Strategy (Placeholder)
 *
 * TODO: Implement Apple Sign-In strategy.
 * Apple Sign-In does not use a standard OAuth2 flow compatible with generic
 * Passport strategies. It requires:
 *   - A custom Passport strategy (e.g., passport-apple or a manual implementation)
 *   - An Apple Developer account with Sign-In with Apple enabled
 *   - A Services ID, Key ID, Team ID, and private key (.p8 file)
 *   - Token verification using Apple's public keys (JWKS)
 *
 * Required config values:
 *   - APPLE_CLIENT_ID (Services ID)
 *   - APPLE_TEAM_ID
 *   - APPLE_KEY_ID
 *   - APPLE_PRIVATE_KEY_PATH (path to .p8 file)
 *   - APPLE_CALLBACK_URL
 *
 * Reference: https://developer.apple.com/sign-in-with-apple/
 */
@Injectable()
export class AppleOAuthStrategy {
  // TODO: Extend PassportStrategy once a suitable Apple Sign-In
  // Passport strategy package is added (e.g., @arendajaelu/nestjs-passport-apple
  // or a custom implementation).

  validate(): AppleOAuthUser {
    throw new Error('Apple OAuth strategy is not yet implemented');
  }
}
