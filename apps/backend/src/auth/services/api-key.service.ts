import { HashingService } from '@common/hashing/hashing.service';
import { ApiKeyRepository } from '@db/repositories/auth/api-key.repository';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { randomBytes } from 'crypto';

import { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly hashingService: HashingService
  ) {}

  /**
   * Generates a new API key for a user.
   * The plaintext key is returned only once; only the hash is stored.
   */
  async generateApiKey(
    userId: string,
    name: string,
    scopes: string[]
  ): Promise<{ key: string; prefix: string; id: string }> {
    const rawKey = randomBytes(32).toString('hex');
    const prefix = rawKey.substring(0, 8);
    const keyHash = await this.hashingService.hash(rawKey);

    const id = await this.apiKeyRepository.createApiKey({
      userId,
      name,
      keyHash,
      prefix,
      scopes,
    });

    return {
      key: rawKey,
      prefix,
      id,
    };
  }

  /**
   * Validates an API key string by looking up its prefix, comparing the hash,
   * and checking that it is not expired or revoked.
   * Returns the associated AuthUser with roles and permissions, or null if invalid.
   */
  async validateApiKey(keyString: string): Promise<AuthUser | null> {
    const prefix = keyString.substring(0, 8);

    const keyRows = await this.apiKeyRepository.findActiveKeysByPrefix(prefix);

    for (const keyRow of keyRows) {
      const isMatch = await this.hashingService.compare(keyString, keyRow.keyHash);
      if (!isMatch) {
        continue;
      }

      // Check expiry
      if (keyRow.expiresAt && keyRow.expiresAt < new Date()) {
        return null;
      }

      // Update last used timestamp
      await this.apiKeyRepository.updateLastUsed(keyRow.id);

      // Load user with roles and permissions
      const authUser = await this.apiKeyRepository.findUserWithRolesAndPermissions(keyRow.userId);
      return authUser;
    }

    return null;
  }

  /**
   * Revokes an API key. Only the key owner can revoke their own keys.
   */
  async revokeApiKey(keyId: string, userId: string): Promise<void> {
    const keyRow = await this.apiKeyRepository.findApiKeyById(keyId);

    if (!keyRow) {
      throw new NotFoundException('API key not found');
    }

    if (keyRow.userId !== userId) {
      throw new ForbiddenException('You can only revoke your own API keys');
    }

    await this.apiKeyRepository.revokeKey(keyId);
  }

  /**
   * Lists all API keys for a user, excluding sensitive hash data.
   */
  async listApiKeys(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      prefix: string;
      scopes: unknown;
      lastUsedAt: Date | null;
      expiresAt: Date | null;
      revokedAt: Date | null;
      createdAt: Date;
    }>
  > {
    return this.apiKeyRepository.findKeysByUserId(userId);
  }
}
