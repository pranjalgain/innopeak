import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

@Injectable()
export class TokenRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Stores a hashed refresh token in the database.
   */
  async storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.dbService.db.insert(schema.refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
    });
  }

  /**
   * Finds all active (non-revoked) refresh tokens for a user.
   */
  async findActiveTokensByUserId(
    userId: string
  ): Promise<Array<{ id: string; tokenHash: string }>> {
    return this.dbService.db
      .select({
        id: schema.refreshTokens.id,
        tokenHash: schema.refreshTokens.tokenHash,
      })
      .from(schema.refreshTokens)
      .where(and(eq(schema.refreshTokens.userId, userId), isNull(schema.refreshTokens.revokedAt)));
  }

  /**
   * Revokes a single refresh token by setting its revokedAt timestamp.
   */
  async revokeToken(tokenId: string): Promise<void> {
    await this.dbService.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, tokenId));
  }

  /**
   * Revokes all active refresh tokens for a user.
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.dbService.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.refreshTokens.userId, userId), isNull(schema.refreshTokens.revokedAt)));
  }

  /**
   * Loads a user with their associated roles and permissions.
   * Returns null if the user is not found.
   */
  async findUserWithRolesAndPermissions(userId: string): Promise<AuthUser | null> {
    const userRows = await this.dbService.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const userRow = userRows[0];
    if (!userRow) {
      return null;
    }

    const userRolesData = await this.dbService.db
      .select({
        roleName: schema.roles.name,
      })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userId));

    const roleNames = userRolesData.map(r => r.roleName);

    const permissionsData = await this.dbService.db
      .select({
        permissionName: schema.permissions.name,
      })
      .from(schema.userRoles)
      .innerJoin(schema.rolePermissions, eq(schema.userRoles.roleId, schema.rolePermissions.roleId))
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.userRoles.userId, userId));

    const permissionNames = [...new Set(permissionsData.map(p => p.permissionName))];

    return {
      id: userRow.id,
      email: userRow.email,
      roles: roleNames,
      permissions: permissionNames,
    };
  }
}
