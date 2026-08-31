import { HashingService } from '@common/hashing/hashing.service';
import { ApiKeyRepository } from '@db/repositories/auth/api-key.repository';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ApiKeyService } from './api-key.service';

import type { AuthUser } from '../interfaces/auth-user.interface';

describe('ApiKeyService', () => {
  let target: ApiKeyService;
  let apiKeyRepository: {
    createApiKey: jest.Mock;
    findActiveKeysByPrefix: jest.Mock;
    updateLastUsed: jest.Mock;
    findUserWithRolesAndPermissions: jest.Mock;
    findApiKeyById: jest.Mock;
    revokeKey: jest.Mock;
    findKeysByUserId: jest.Mock;
  };
  let hashingService: { hash: jest.Mock; compare: jest.Mock };

  const authUser: AuthUser = {
    id: 'user-1',
    email: 'user@example.com',
    roles: ['user'],
    permissions: [],
  };

  beforeEach(async () => {
    apiKeyRepository = {
      createApiKey: jest.fn(),
      findActiveKeysByPrefix: jest.fn(),
      updateLastUsed: jest.fn(),
      findUserWithRolesAndPermissions: jest.fn(),
      findApiKeyById: jest.fn(),
      revokeKey: jest.fn(),
      findKeysByUserId: jest.fn(),
    };
    hashingService = {
      hash: jest.fn(),
      compare: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: ApiKeyRepository, useValue: apiKeyRepository },
        { provide: HashingService, useValue: hashingService },
      ],
    }).compile();

    target = module.get(ApiKeyService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateApiKey', () => {
    it('creates a hashed API key and returns the plaintext key once', async () => {
      hashingService.hash.mockResolvedValue('hashed-key');
      apiKeyRepository.createApiKey.mockResolvedValue('key-id-1');

      const result = await target.generateApiKey('user-1', 'my key', ['read']);

      expect(result.id).toBe('key-id-1');
      expect(result.key).toHaveLength(64);
      expect(result.prefix).toBe(result.key.substring(0, 8));
      expect(apiKeyRepository.createApiKey).toHaveBeenCalledWith({
        userId: 'user-1',
        name: 'my key',
        keyHash: 'hashed-key',
        prefix: result.prefix,
        scopes: ['read'],
      });
    });
  });

  describe('validateApiKey', () => {
    it('returns the authenticated user when a matching, active key is found', async () => {
      apiKeyRepository.findActiveKeysByPrefix.mockResolvedValue([
        { id: 'key-1', userId: 'user-1', keyHash: 'hash-1', expiresAt: null },
      ]);
      hashingService.compare.mockResolvedValue(true);
      apiKeyRepository.findUserWithRolesAndPermissions.mockResolvedValue(authUser);

      const result = await target.validateApiKey('rawkeystring12345678');

      expect(apiKeyRepository.updateLastUsed).toHaveBeenCalledWith('key-1');
      expect(result).toEqual(authUser);
    });

    it('returns null when the matching key has expired', async () => {
      apiKeyRepository.findActiveKeysByPrefix.mockResolvedValue([
        {
          id: 'key-1',
          userId: 'user-1',
          keyHash: 'hash-1',
          expiresAt: new Date(Date.now() - 1000),
        },
      ]);
      hashingService.compare.mockResolvedValue(true);

      const result = await target.validateApiKey('rawkeystring12345678');

      expect(result).toBeNull();
      expect(apiKeyRepository.updateLastUsed).not.toHaveBeenCalled();
    });

    it('returns null when no key with a matching prefix has a matching hash', async () => {
      apiKeyRepository.findActiveKeysByPrefix.mockResolvedValue([
        { id: 'key-1', userId: 'user-1', keyHash: 'hash-1', expiresAt: null },
      ]);
      hashingService.compare.mockResolvedValue(false);

      const result = await target.validateApiKey('rawkeystring12345678');

      expect(result).toBeNull();
    });

    it('returns null when no active keys share the prefix', async () => {
      apiKeyRepository.findActiveKeysByPrefix.mockResolvedValue([]);

      const result = await target.validateApiKey('rawkeystring12345678');

      expect(result).toBeNull();
      expect(hashingService.compare).not.toHaveBeenCalled();
    });
  });

  describe('revokeApiKey', () => {
    it('revokes the key when the requesting user is the owner', async () => {
      apiKeyRepository.findApiKeyById.mockResolvedValue({ id: 'key-1', userId: 'user-1' });

      await target.revokeApiKey('key-1', 'user-1');

      expect(apiKeyRepository.revokeKey).toHaveBeenCalledWith('key-1');
    });

    it('throws NotFoundException when the key does not exist', async () => {
      apiKeyRepository.findApiKeyById.mockResolvedValue(null);

      await expect(target.revokeApiKey('missing-key', 'user-1')).rejects.toThrow(NotFoundException);
      expect(apiKeyRepository.revokeKey).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the requesting user does not own the key', async () => {
      apiKeyRepository.findApiKeyById.mockResolvedValue({ id: 'key-1', userId: 'someone-else' });

      await expect(target.revokeApiKey('key-1', 'user-1')).rejects.toThrow(ForbiddenException);
      expect(apiKeyRepository.revokeKey).not.toHaveBeenCalled();
    });
  });

  describe('listApiKeys', () => {
    it('returns the keys belonging to the user', async () => {
      const keys = [
        {
          id: 'key-1',
          name: 'my key',
          prefix: 'abcd1234',
          scopes: ['read'],
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
        },
      ];
      apiKeyRepository.findKeysByUserId.mockResolvedValue(keys);

      const result = await target.listApiKeys('user-1');

      expect(result).toEqual(keys);
      expect(apiKeyRepository.findKeysByUserId).toHaveBeenCalledWith('user-1');
    });
  });
});
