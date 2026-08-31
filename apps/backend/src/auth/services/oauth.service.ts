import { OAuthRepository } from '@db/repositories/auth/oauth.repository';
import { Injectable } from '@nestjs/common';

import { AuthUser } from '../interfaces/auth-user.interface';
import { OAuthProfile } from '../interfaces/oauth-profile.interface';

@Injectable()
export class OAuthService {
  constructor(private readonly oauthRepository: OAuthRepository) {}

  /**
   * Finds an existing OAuth account or creates a new user with the OAuth account linked.
   * If the OAuth account already exists, updates the tokens. If not, checks for an existing
   * user by email or creates a brand new user, then links the OAuth account.
   * Assigns the default 'user' role to newly created users.
   */
  async findOrCreateOAuthUser(profile: OAuthProfile): Promise<AuthUser> {
    // Check if OAuth account already exists
    const existingOAuth = await this.oauthRepository.findOAuthAccount(
      profile.provider,
      profile.providerId
    );

    if (existingOAuth) {
      // Update tokens if provided
      if (profile.accessToken || profile.refreshToken) {
        await this.oauthRepository.updateOAuthTokens(
          existingOAuth.id,
          profile.accessToken ?? null,
          profile.refreshToken ?? null
        );
      }

      return this.oauthRepository.loadUserWithRolesAndPermissions(existingOAuth.userId);
    }

    // Check if a user with this email already exists
    const existingUser = await this.oauthRepository.findUserByEmail(profile.email);
    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create a new user
      userId = await this.oauthRepository.createUser({
        email: profile.email,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
      });

      // Assign default 'user' role
      await this.oauthRepository.assignDefaultRole(userId);
    }

    // Link the OAuth account
    await this.oauthRepository.createOAuthAccount({
      userId,
      provider: profile.provider,
      providerUserId: profile.providerId,
      accessToken: profile.accessToken ?? null,
      refreshToken: profile.refreshToken ?? null,
    });

    return this.oauthRepository.loadUserWithRolesAndPermissions(userId);
  }
}
