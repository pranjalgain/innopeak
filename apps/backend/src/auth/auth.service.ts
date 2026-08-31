import { HashingService } from '@common/hashing/hashing.service';
import { AuthRepository } from '@db/repositories/auth/auth.repository';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OAuthProfile } from './interfaces/oauth-profile.interface';
import { TokenResponse } from './interfaces/token-response.interface';
import { OAuthService } from './services/oauth.service';
import { TokenService } from './services/token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    private readonly oauthService: OAuthService
  ) {}

  /**
   * Registers a new user with the given credentials.
   * Hashes the password, assigns the default 'user' role, and generates tokens.
   */
  async register(dto: RegisterDto): Promise<TokenResponse> {
    // Check if email is already taken
    const existingUser = await this.authRepository.findUserByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.hashingService.hash(dto.password);

    const userId = await this.authRepository.createUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    // Assign default 'user' role
    await this.authRepository.assignRole(userId, 'user');

    const authUser = await this.authRepository.getUserWithRolesAndPermissions(userId);

    return this.tokenService.generateTokens(authUser);
  }

  /**
   * Authenticates a user with email and password.
   * Loads roles and permissions, then generates a token pair.
   */
  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = await this.authRepository.findUserByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Please use OAuth to sign in');
    }

    const isPasswordValid = await this.hashingService.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const authUser = await this.authRepository.getUserWithRolesAndPermissions(user.id);

    return this.tokenService.generateTokens(authUser);
  }

  /**
   * Refreshes the token pair using a valid refresh token.
   * Delegates to TokenService which handles rotation and revocation.
   */
  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    return this.tokenService.refreshTokens(refreshToken);
  }

  /**
   * Logs out a user by revoking all their refresh tokens.
   */
  async logout(userId: string): Promise<void> {
    await this.tokenService.revokeAllUserTokens(userId);
  }

  /**
   * Changes a user's password after verifying the current password.
   * Revokes all existing refresh tokens for security.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.authRepository.findUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Cannot change password for OAuth-only accounts');
    }

    const isCurrentValid = await this.hashingService.compare(
      dto.currentPassword,
      user.passwordHash
    );
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);

    await this.authRepository.updateUserPassword(userId, newPasswordHash);

    // Revoke all refresh tokens after password change
    await this.tokenService.revokeAllUserTokens(userId);
  }

  /**
   * Handles OAuth login by delegating to OAuthService, then generating tokens.
   */
  async handleOAuthLogin(profile: OAuthProfile): Promise<TokenResponse> {
    const authUser = await this.oauthService.findOrCreateOAuthUser(profile);
    return this.tokenService.generateTokens(authUser);
  }
}
