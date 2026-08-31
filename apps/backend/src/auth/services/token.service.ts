import { HashingService } from '@common/hashing/hashing.service';
import { EnvConfig } from '@config/env.config';
import { TokenRepository } from '@db/repositories/auth/token.repository';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthUser } from '../interfaces/auth-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { TokenResponse } from '../interfaces/token-response.interface';

@Injectable()
export class TokenService {
  private readonly accessTokenExpiresIn: number;
  private readonly refreshTokenExpiresIn: number;
  private readonly refreshSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly tokenRepository: TokenRepository,
    private readonly hashingService: HashingService
  ) {
    this.accessTokenExpiresIn = 900; // 15 minutes default
    this.refreshTokenExpiresIn = 604800; // 7 days default
    this.refreshSecret =
      this.configService.get('JWT_REFRESH_SECRET') ?? this.configService.get('JWT_SECRET') ?? '';
  }

  /**
   * Generates a new access token and refresh token pair for the given user.
   * The refresh token is hashed and stored in the database.
   */
  async generateTokens(user: AuthUser): Promise<TokenResponse> {
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    };

    const refreshPayload = { sub: user.id };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        expiresIn: this.accessTokenExpiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTokenExpiresIn,
      }),
    ]);

    const tokenHash = await this.hashingService.hash(refreshToken);

    const expiresAt = new Date(Date.now() + this.refreshTokenExpiresIn * 1000);

    await this.tokenRepository.storeRefreshToken(user.id, tokenHash, expiresAt);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  /**
   * Validates an existing refresh token, revokes it, and generates a new token pair.
   * Implements refresh token rotation for enhanced security.
   */
  async refreshTokens(oldRefreshToken: string): Promise<TokenResponse> {
    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(oldRefreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = payload.sub;

    // Find all active (non-revoked) refresh tokens for this user
    const activeTokens = await this.tokenRepository.findActiveTokensByUserId(userId);

    // Find the matching token by comparing hashes
    let matchedTokenId: string | undefined;
    for (const token of activeTokens) {
      const isMatch = await this.hashingService.compare(oldRefreshToken, token.tokenHash);
      if (isMatch) {
        matchedTokenId = token.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new UnauthorizedException('Refresh token not found or already revoked');
    }

    // Revoke the old token
    await this.tokenRepository.revokeToken(matchedTokenId);

    // Load user with roles and permissions
    const authUser = await this.tokenRepository.findUserWithRolesAndPermissions(userId);

    if (!authUser) {
      throw new UnauthorizedException('User not found');
    }

    return this.generateTokens(authUser);
  }

  /**
   * Revokes all active refresh tokens for a given user.
   * Used during logout or security-sensitive operations.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.tokenRepository.revokeAllUserTokens(userId);
  }
}
