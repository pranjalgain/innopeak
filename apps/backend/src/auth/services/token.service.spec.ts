import { HashingService } from '@common/hashing/hashing.service';
import { TokenRepository } from '@db/repositories/auth/token.repository';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { TokenService } from './token.service';

import type { AuthUser } from '../interfaces/auth-user.interface';

describe('TokenService', () => {
  let target: TokenService;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let tokenRepository: {
    storeRefreshToken: jest.Mock;
    findActiveTokensByUserId: jest.Mock;
    revokeToken: jest.Mock;
    revokeAllUserTokens: jest.Mock;
    findUserWithRolesAndPermissions: jest.Mock;
  };
  let hashingService: { hash: jest.Mock; compare: jest.Mock };
  let configService: { get: jest.Mock };

  const authUser: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['user'],
    permissions: ['users:read'],
  };

  beforeEach(async () => {
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };
    tokenRepository = {
      storeRefreshToken: jest.fn(),
      findActiveTokensByUserId: jest.fn(),
      revokeToken: jest.fn(),
      revokeAllUserTokens: jest.fn(),
      findUserWithRolesAndPermissions: jest.fn(),
    };
    hashingService = {
      hash: jest.fn(),
      compare: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
        if (key === 'JWT_SECRET') return 'access-secret';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: TokenRepository, useValue: tokenRepository },
        { provide: HashingService, useValue: hashingService },
      ],
    }).compile();

    target = module.get(TokenService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateTokens', () => {
    it('signs an access and refresh token, hashes and stores the refresh token', async () => {
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      hashingService.hash.mockResolvedValue('hashed-refresh-token');

      const result = await target.generateTokens(authUser);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      });
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        {
          sub: authUser.id,
          email: authUser.email,
          roles: authUser.roles,
          permissions: authUser.permissions,
        },
        { expiresIn: 900 }
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { sub: authUser.id },
        { secret: 'refresh-secret', expiresIn: 604800 }
      );
      expect(hashingService.hash).toHaveBeenCalledWith('refresh-token');
      expect(tokenRepository.storeRefreshToken).toHaveBeenCalledWith(
        authUser.id,
        'hashed-refresh-token',
        expect.any(Date)
      );
    });

    it('falls back to JWT_SECRET when JWT_REFRESH_SECRET is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'access-secret';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TokenService,
          { provide: JwtService, useValue: jwtService },
          { provide: ConfigService, useValue: configService },
          { provide: TokenRepository, useValue: tokenRepository },
          { provide: HashingService, useValue: hashingService },
        ],
      }).compile();
      const fallbackTarget = module.get(TokenService);

      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      hashingService.hash.mockResolvedValue('hashed-refresh-token');

      await fallbackTarget.generateTokens(authUser);

      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { sub: authUser.id },
        {
          secret: 'access-secret',
          expiresIn: 604800,
        }
      );
    });
  });

  describe('refreshTokens', () => {
    it('rotates a valid refresh token and returns a new token pair', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: authUser.id });
      tokenRepository.findActiveTokensByUserId.mockResolvedValue([
        { id: 'token-1', tokenHash: 'hash-1' },
      ]);
      hashingService.compare.mockResolvedValue(true);
      tokenRepository.findUserWithRolesAndPermissions.mockResolvedValue(authUser);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      hashingService.hash.mockResolvedValue('hashed-new-refresh-token');

      const result = await target.refreshTokens('old-refresh-token');

      expect(tokenRepository.revokeToken).toHaveBeenCalledWith('token-1');
      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
      });
    });

    it('throws UnauthorizedException when the token fails JWT verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(target.refreshTokens('bad-token')).rejects.toThrow(UnauthorizedException);
      expect(tokenRepository.findActiveTokensByUserId).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when no stored token hash matches', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: authUser.id });
      tokenRepository.findActiveTokensByUserId.mockResolvedValue([
        { id: 'token-1', tokenHash: 'hash-1' },
      ]);
      hashingService.compare.mockResolvedValue(false);

      await expect(target.refreshTokens('old-refresh-token')).rejects.toThrow(
        UnauthorizedException
      );
      expect(tokenRepository.revokeToken).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the user can no longer be found', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: authUser.id });
      tokenRepository.findActiveTokensByUserId.mockResolvedValue([
        { id: 'token-1', tokenHash: 'hash-1' },
      ]);
      hashingService.compare.mockResolvedValue(true);
      tokenRepository.findUserWithRolesAndPermissions.mockResolvedValue(null);

      await expect(target.refreshTokens('old-refresh-token')).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('revokeAllUserTokens', () => {
    it('delegates to the token repository', async () => {
      tokenRepository.revokeAllUserTokens.mockResolvedValue(undefined);

      await target.revokeAllUserTokens('user-1');

      expect(tokenRepository.revokeAllUserTokens).toHaveBeenCalledWith('user-1');
    });
  });
});
