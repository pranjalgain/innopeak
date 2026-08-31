import { HashingService } from '@common/hashing/hashing.service';
import { AuthRepository } from '@db/repositories/auth/auth.repository';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuthService } from './auth.service';
import type { AuthUser } from './interfaces/auth-user.interface';
import { OAuthService } from './services/oauth.service';
import { TokenService } from './services/token.service';

describe('AuthService', () => {
  let target: AuthService;
  let authRepository: {
    findUserByEmail: jest.Mock;
    createUser: jest.Mock;
    assignRole: jest.Mock;
    getUserWithRolesAndPermissions: jest.Mock;
    updateUserPassword: jest.Mock;
    findUserById: jest.Mock;
  };
  let hashingService: { hash: jest.Mock; compare: jest.Mock };
  let tokenService: {
    generateTokens: jest.Mock;
    refreshTokens: jest.Mock;
    revokeAllUserTokens: jest.Mock;
  };
  let oauthService: { findOrCreateOAuthUser: jest.Mock };

  const authUser: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
  };

  const tokenResponse = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  };

  beforeEach(async () => {
    authRepository = {
      findUserByEmail: jest.fn(),
      createUser: jest.fn(),
      assignRole: jest.fn(),
      getUserWithRolesAndPermissions: jest.fn(),
      updateUserPassword: jest.fn(),
      findUserById: jest.fn(),
    };
    hashingService = {
      hash: jest.fn(),
      compare: jest.fn(),
    };
    tokenService = {
      generateTokens: jest.fn(),
      refreshTokens: jest.fn(),
      revokeAllUserTokens: jest.fn(),
    };
    oauthService = {
      findOrCreateOAuthUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepository },
        { provide: HashingService, useValue: hashingService },
        { provide: TokenService, useValue: tokenService },
        { provide: OAuthService, useValue: oauthService },
      ],
    }).compile();

    target = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    const dto = {
      email: 'new@example.com',
      password: 'StrongP@ss1',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    it('creates a new user, assigns the default role, and returns generated tokens', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);
      hashingService.hash.mockResolvedValue('hashed-password');
      authRepository.createUser.mockResolvedValue('user-1');
      authRepository.getUserWithRolesAndPermissions.mockResolvedValue(authUser);
      tokenService.generateTokens.mockResolvedValue(tokenResponse);

      const result = await target.register(dto);

      expect(authRepository.createUser).toHaveBeenCalledWith({
        email: dto.email,
        passwordHash: 'hashed-password',
        firstName: dto.firstName,
        lastName: dto.lastName,
      });
      expect(authRepository.assignRole).toHaveBeenCalledWith('user-1', 'user');
      expect(result).toEqual(tokenResponse);
    });

    it('throws ConflictException when the email is already registered', async () => {
      authRepository.findUserByEmail.mockResolvedValue({ id: 'existing' });

      await expect(target.register(dto)).rejects.toThrow(ConflictException);
      expect(authRepository.createUser).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const dto = { email: 'user@example.com', password: 'StrongP@ss1' };

    it('authenticates a valid user and returns generated tokens', async () => {
      authRepository.findUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: 'hashed-password',
        isActive: true,
      });
      hashingService.compare.mockResolvedValue(true);
      authRepository.getUserWithRolesAndPermissions.mockResolvedValue(authUser);
      tokenService.generateTokens.mockResolvedValue(tokenResponse);

      const result = await target.login(dto);

      expect(result).toEqual(tokenResponse);
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);

      await expect(target.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the account is deactivated', async () => {
      authRepository.findUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: 'hashed-password',
        isActive: false,
      });

      await expect(target.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the account is OAuth-only (no password hash)', async () => {
      authRepository.findUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: null,
        isActive: true,
      });

      await expect(target.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      authRepository.findUserByEmail.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        passwordHash: 'hashed-password',
        isActive: true,
      });
      hashingService.compare.mockResolvedValue(false);

      await expect(target.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('delegates to TokenService', async () => {
      tokenService.refreshTokens.mockResolvedValue(tokenResponse);

      const result = await target.refreshTokens('old-refresh-token');

      expect(tokenService.refreshTokens).toHaveBeenCalledWith('old-refresh-token');
      expect(result).toEqual(tokenResponse);
    });
  });

  describe('logout', () => {
    it('revokes all refresh tokens for the user', async () => {
      await target.logout('user-1');

      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
    });
  });

  describe('changePassword', () => {
    const dto = { currentPassword: 'OldP@ssw0rd', newPassword: 'NewStr0ng@Pass' };

    it('updates the password and revokes all refresh tokens', async () => {
      authRepository.findUserById.mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' });
      hashingService.compare.mockResolvedValue(true);
      hashingService.hash.mockResolvedValue('new-hash');

      await target.changePassword('user-1', dto);

      expect(hashingService.compare).toHaveBeenCalledWith(dto.currentPassword, 'old-hash');
      expect(authRepository.updateUserPassword).toHaveBeenCalledWith('user-1', 'new-hash');
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
    });

    it('throws NotFoundException when the user does not exist', async () => {
      authRepository.findUserById.mockResolvedValue(null);

      await expect(target.changePassword('user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for OAuth-only accounts (no password hash)', async () => {
      authRepository.findUserById.mockResolvedValue({ id: 'user-1', passwordHash: null });

      await expect(target.changePassword('user-1', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException when the current password is incorrect', async () => {
      authRepository.findUserById.mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' });
      hashingService.compare.mockResolvedValue(false);

      await expect(target.changePassword('user-1', dto)).rejects.toThrow(UnauthorizedException);
      expect(authRepository.updateUserPassword).not.toHaveBeenCalled();
    });
  });

  describe('handleOAuthLogin', () => {
    it('delegates to OAuthService then generates tokens', async () => {
      const profile = {
        provider: 'google',
        providerId: 'google-123',
        email: 'user@example.com',
      };
      oauthService.findOrCreateOAuthUser.mockResolvedValue(authUser);
      tokenService.generateTokens.mockResolvedValue(tokenResponse);

      const result = await target.handleOAuthLogin(profile);

      expect(oauthService.findOrCreateOAuthUser).toHaveBeenCalledWith(profile);
      expect(tokenService.generateTokens).toHaveBeenCalledWith(authUser);
      expect(result).toEqual(tokenResponse);
    });
  });
});
