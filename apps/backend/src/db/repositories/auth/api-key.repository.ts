import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

@Injectable()
export class ApiKeyRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Inserts a new API key record and returns its generated id.
   */
  async createApiKey(data: {
    userId: string;
    name: string;
    keyHash: string;
    prefix: string;
    scopes: string[];
  }): Promise<string> {
    const rows = await this.dbService.db
      .insert(schema.apiKeys)
      .values({
        userId: data.userId,
        name: data.name,
        keyHash: data.keyHash,
        prefix: data.prefix,
        scopes: data.scopes,
      })
      .returning({ id: schema.apiKeys.id });

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create API key');
    }

    return row.id;
  }

  /**
   * Finds all active (non-revoked) API keys matching a given prefix.
   * Returns full key rows for hash comparison.
   */
  async findActiveKeysByPrefix(prefix: string): Promise<
    Array<{
      id: string;
      userId: string;
      keyHash: string;
      expiresAt: Date | null;
    }>
  > {
    return this.dbService.db
      .select({
        id: schema.apiKeys.id,
        userId: schema.apiKeys.userId,
        keyHash: schema.apiKeys.keyHash,
        expiresAt: schema.apiKeys.expiresAt,
      })
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.prefix, prefix), isNull(schema.apiKeys.revokedAt)));
  }

  /**
   * Updates the lastUsedAt timestamp for an API key.
   */
  async updateLastUsed(keyId: string): Promise<void> {
    await this.dbService.db
      .update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, keyId));
  }

  /**
   * Finds an API key by id, returning ownership info for authorization checks.
   * Returns null if not found.
   */
  async findApiKeyById(keyId: string): Promise<{ id: string; userId: string } | null> {
    const rows = await this.dbService.db
      .select({ id: schema.apiKeys.id, userId: schema.apiKeys.userId })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, keyId))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Revokes an API key by setting its revokedAt timestamp.
   */
  async revokeKey(keyId: string): Promise<void> {
    await this.dbService.db
      .update(schema.apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.apiKeys.id, keyId));
  }

  /**
   * Lists all API keys for a user, excluding sensitive hash data.
   */
  async findKeysByUserId(userId: string): Promise<
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
    return this.dbService.db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        prefix: schema.apiKeys.prefix,
        scopes: schema.apiKeys.scopes,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        expiresAt: schema.apiKeys.expiresAt,
        revokedAt: schema.apiKeys.revokedAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, userId));
  }

  /**
   * Loads a user with their associated roles and permissions.
   * Returns null if the user is not found.
   */
  async findUserWithRolesAndPermissions(userId: string): Promise<AuthUser | null> {
    const userRows = await this.dbService.db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      return null;
    }

    const userRolesData = await this.dbService.db
      .select({ roleName: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, user.id));

    const roleNames = userRolesData.map(r => r.roleName);

    const permissionsData = await this.dbService.db
      .select({ permissionName: schema.permissions.name })
      .from(schema.userRoles)
      .innerJoin(schema.rolePermissions, eq(schema.userRoles.roleId, schema.rolePermissions.roleId))
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.userRoles.userId, user.id));

    const permissionNames = [...new Set(permissionsData.map(p => p.permissionName))];

    return {
      id: user.id,
      email: user.email,
      roles: roleNames,
      permissions: permissionNames,
    };
  }
}
