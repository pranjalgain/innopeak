import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

// AuthController transitively imports MfaService, which imports 'otplib' and 'qrcode'.
// otplib's scure-base32 plugin ships ESM that ts-jest/CommonJS cannot parse, so these
// modules are mocked here even though MfaService itself is fully replaced with a stub.
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  generateURI: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { AuthUser } from './interfaces/auth-user.interface';
import { MfaService } from './services/mfa.service';

describe('AuthController', () => {
  let target: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refreshTokens: jest.Mock;
    logout: jest.Mock;
    changePassword: jest.Mock;
    handleOAuthLogin: jest.Mock;
  };
  let mfaService: { setupTotp: jest.Mock; verifyTotp: jest.Mock };

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
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      changePassword: jest.fn(),
      handleOAuthLogin: jest.fn(),
    };
    mfaService = {
      setupTotp: jest.fn(),
      verifyTotp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: MfaService, useValue: mfaService },
      ],
    }).compile();

    target = module.get(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('delegates to authService.register and returns the token response', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'StrongP@ss1',
        firstName: 'Jane',
        lastName: 'Doe',
      };
      authService.register.mockResolvedValue(tokenResponse);

      const result = await target.register(dto);

      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(tokenResponse);
    });
  });

  describe('login', () => {
    it('delegates to authService.login and returns the token response', async () => {
      const dto = { email: 'user@example.com', password: 'StrongP@ss1' };
      authService.login.mockResolvedValue(tokenResponse);

      const result = await target.login(dto);

      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(tokenResponse);
    });

    it('propagates errors thrown by authService.login', async () => {
      const dto = { email: 'user@example.com', password: 'wrong' };
      authService.login.mockRejectedValue(new Error('Invalid email or password'));

      await expect(target.login(dto)).rejects.toThrow('Invalid email or password');
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshTokens with the refresh token from the body', async () => {
      authService.refreshTokens.mockResolvedValue(tokenResponse);

      const result = await target.refresh({ refreshToken: 'old-refresh-token' });

      expect(authService.refreshTokens).toHaveBeenCalledWith('old-refresh-token');
      expect(result).toEqual(tokenResponse);
    });
  });

  describe('logout', () => {
    it('revokes tokens for the current user and returns a confirmation message', async () => {
      authService.logout.mockResolvedValue(undefined);

      const result = await target.logout(authUser);

      expect(authService.logout).toHaveBeenCalledWith(authUser.id);
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('changePassword', () => {
    it('delegates to authService.changePassword and returns a confirmation message', async () => {
      const dto = { currentPassword: 'OldP@ssw0rd', newPassword: 'NewStr0ng@Pass' };
      authService.changePassword.mockResolvedValue(undefined);

      const result = await target.changePassword(authUser, dto);

      expect(authService.changePassword).toHaveBeenCalledWith(authUser.id, dto);
      expect(result).toEqual({ message: 'Password changed successfully' });
    });
  });

  describe('googleAuthCallback', () => {
    it('extracts the OAuth profile from the request and delegates to authService.handleOAuthLogin', async () => {
      const oauthUser = {
        provider: 'google',
        providerId: 'google-123',
        email: 'user@example.com',
      };
      authService.handleOAuthLogin.mockResolvedValue(tokenResponse);
      const req = { user: oauthUser } as unknown as Parameters<
        AuthController['googleAuthCallback']
      >[0];

      const result = await target.googleAuthCallback(req);

      expect(authService.handleOAuthLogin).toHaveBeenCalledWith(oauthUser);
      expect(result).toEqual(tokenResponse);
    });
  });

  describe('githubAuthCallback', () => {
    it('extracts the OAuth profile from the request and delegates to authService.handleOAuthLogin', async () => {
      const oauthUser = {
        provider: 'github',
        providerId: 'gh-123',
        email: 'user@example.com',
      };
      authService.handleOAuthLogin.mockResolvedValue(tokenResponse);
      const req = { user: oauthUser } as unknown as Parameters<
        AuthController['githubAuthCallback']
      >[0];

      const result = await target.githubAuthCallback(req);

      expect(authService.handleOAuthLogin).toHaveBeenCalledWith(oauthUser);
      expect(result).toEqual(tokenResponse);
    });
  });

  describe('mfaSetup', () => {
    it('delegates to mfaService.setupTotp for the current user', async () => {
      const setup = {
        secret: 'SECRET123',
        otpauthUrl: 'otpauth://totp/NestJS%20App:user@example.com',
        qrCode: 'data:image/png;base64,abc',
      };
      mfaService.setupTotp.mockResolvedValue(setup);

      const result = await target.mfaSetup(authUser);

      expect(mfaService.setupTotp).toHaveBeenCalledWith(authUser.id);
      expect(result).toEqual(setup);
    });
  });

  describe('mfaVerify', () => {
    it('returns verified true when the code is correct', async () => {
      mfaService.verifyTotp.mockResolvedValue(true);

      const result = await target.mfaVerify(authUser, { code: '123456', type: 'totp' as never });

      expect(mfaService.verifyTotp).toHaveBeenCalledWith(authUser.id, '123456');
      expect(result).toEqual({ verified: true });
    });

    it('returns verified false when the code is incorrect', async () => {
      mfaService.verifyTotp.mockResolvedValue(false);

      const result = await target.mfaVerify(authUser, { code: '000000', type: 'totp' as never });

      expect(result).toEqual({ verified: false });
    });
  });
});
