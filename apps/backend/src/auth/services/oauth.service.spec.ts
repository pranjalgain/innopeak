import { OAuthRepository } from '@db/repositories/auth/oauth.repository';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { OAuthService } from './oauth.service';

import type { AuthUser } from '../interfaces/auth-user.interface';

describe('OAuthService', () => {
  let target: OAuthService;
  let oauthRepository: {
    findOAuthAccount: jest.Mock;
    updateOAuthTokens: jest.Mock;
    findUserByEmail: jest.Mock;
    createUser: jest.Mock;
    assignDefaultRole: jest.Mock;
    createOAuthAccount: jest.Mock;
    loadUserWithRolesAndPermissions: jest.Mock;
  };

  const authUser: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
  };

  const profile = {
    provider: 'google',
    providerId: 'google-123',
    email: 'user@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  };

  beforeEach(async () => {
    oauthRepository = {
      findOAuthAccount: jest.fn(),
      updateOAuthTokens: jest.fn(),
      findUserByEmail: jest.fn(),
      createUser: jest.fn(),
      assignDefaultRole: jest.fn(),
      createOAuthAccount: jest.fn(),
      loadUserWithRolesAndPermissions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [OAuthService, { provide: OAuthRepository, useValue: oauthRepository }],
    }).compile();

    target = module.get(OAuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOrCreateOAuthUser', () => {
    it('updates tokens and returns the user when an OAuth account already exists', async () => {
      oauthRepository.findOAuthAccount.mockResolvedValue({ id: 'oauth-1', userId: 'user-1' });
      oauthRepository.loadUserWithRolesAndPermissions.mockResolvedValue(authUser);

      const result = await target.findOrCreateOAuthUser(profile);

      expect(oauthRepository.updateOAuthTokens).toHaveBeenCalledWith(
        'oauth-1',
        'access-token',
        'refresh-token'
      );
      expect(oauthRepository.loadUserWithRolesAndPermissions).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(authUser);
      expect(oauthRepository.createUser).not.toHaveBeenCalled();
    });

    it('does not update tokens when an existing OAuth account has no new tokens', async () => {
      oauthRepository.findOAuthAccount.mockResolvedValue({ id: 'oauth-1', userId: 'user-1' });
      oauthRepository.loadUserWithRolesAndPermissions.mockResolvedValue(authUser);

      const {
        accessToken: _accessToken,
        refreshToken: _refreshToken,
        ...profileWithoutTokens
      } = profile;

      await target.findOrCreateOAuthUser(profileWithoutTokens);

      expect(oauthRepository.updateOAuthTokens).not.toHaveBeenCalled();
    });

    it('links a new OAuth account to an existing user found by email', async () => {
      oauthRepository.findOAuthAccount.mockResolvedValue(null);
      oauthRepository.findUserByEmail.mockResolvedValue({ id: 'existing-user' });
      oauthRepository.loadUserWithRolesAndPermissions.mockResolvedValue(authUser);

      const result = await target.findOrCreateOAuthUser(profile);

      expect(oauthRepository.createUser).not.toHaveBeenCalled();
      expect(oauthRepository.assignDefaultRole).not.toHaveBeenCalled();
      expect(oauthRepository.createOAuthAccount).toHaveBeenCalledWith({
        userId: 'existing-user',
        provider: 'google',
        providerUserId: 'google-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(result).toEqual(authUser);
    });

    it('creates a new user, assigns the default role, and links the OAuth account when no user exists', async () => {
      oauthRepository.findOAuthAccount.mockResolvedValue(null);
      oauthRepository.findUserByEmail.mockResolvedValue(null);
      oauthRepository.createUser.mockResolvedValue('new-user-id');
      oauthRepository.loadUserWithRolesAndPermissions.mockResolvedValue(authUser);

      const result = await target.findOrCreateOAuthUser(profile);

      expect(oauthRepository.createUser).toHaveBeenCalledWith({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
      expect(oauthRepository.assignDefaultRole).toHaveBeenCalledWith('new-user-id');
      expect(oauthRepository.createOAuthAccount).toHaveBeenCalledWith({
        userId: 'new-user-id',
        provider: 'google',
        providerUserId: 'google-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(result).toEqual(authUser);
    });

    it('defaults optional profile fields to null when creating a new user', async () => {
      oauthRepository.findOAuthAccount.mockResolvedValue(null);
      oauthRepository.findUserByEmail.mockResolvedValue(null);
      oauthRepository.createUser.mockResolvedValue('new-user-id');
      oauthRepository.loadUserWithRolesAndPermissions.mockResolvedValue(authUser);

      await target.findOrCreateOAuthUser({
        provider: 'github',
        providerId: 'gh-1',
        email: 'nofirstname@example.com',
      });

      expect(oauthRepository.createUser).toHaveBeenCalledWith({
        email: 'nofirstname@example.com',
        firstName: null,
        lastName: null,
      });
      expect(oauthRepository.createOAuthAccount).toHaveBeenCalledWith({
        userId: 'new-user-id',
        provider: 'github',
        providerUserId: 'gh-1',
        accessToken: null,
        refreshToken: null,
      });
    });
  });
});
