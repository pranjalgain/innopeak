import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

@Injectable()
export class OAuthRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Finds an OAuth account by provider and provider user id.
   * Returns the account's id and userId, or null if not found.
   */
  async findOAuthAccount(
    provider: string,
    providerId: string
  ): Promise<{ id: string; userId: string } | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.oauthAccounts.id,
        userId: schema.oauthAccounts.userId,
      })
      .from(schema.oauthAccounts)
      .where(
        and(
          eq(schema.oauthAccounts.provider, provider),
          eq(schema.oauthAccounts.providerUserId, providerId)
        )
      )
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Updates the access and refresh tokens on an existing OAuth account.
   */
  async updateOAuthTokens(
    accountId: string,
    accessToken: string | null,
    refreshToken: string | null
  ): Promise<void> {
    await this.dbService.db
      .update(schema.oauthAccounts)
      .set({
        accessTokenEncrypted: accessToken,
        refreshTokenEncrypted: refreshToken,
        updatedAt: new Date(),
      })
      .where(eq(schema.oauthAccounts.id, accountId));
  }

  /**
   * Finds a user by email, returning only their id.
   * Returns null if not found.
   */
  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    const rows = await this.dbService.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Creates a new user from OAuth profile data.
   * Returns the generated user id.
   */
  async createUser(data: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  }): Promise<string> {
    const rows = await this.dbService.db
      .insert(schema.users)
      .values({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        isEmailVerified: true,
        isActive: true,
      })
      .returning({ id: schema.users.id });

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create user');
    }

    return row.id;
  }

  /**
   * Assigns the default 'user' role to a user.
   */
  async assignDefaultRole(userId: string): Promise<void> {
    const roleRows = await this.dbService.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.name, 'user'))
      .limit(1);

    const role = roleRows[0];
    if (role) {
      await this.dbService.db.insert(schema.userRoles).values({
        userId,
        roleId: role.id,
      });
    }
  }

  /**
   * Creates a new OAuth account record linked to a user.
   */
  async createOAuthAccount(data: {
    userId: string;
    provider: string;
    providerUserId: string;
    accessToken: string | null;
    refreshToken: string | null;
  }): Promise<void> {
    await this.dbService.db.insert(schema.oauthAccounts).values({
      userId: data.userId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      accessTokenEncrypted: data.accessToken,
      refreshTokenEncrypted: data.refreshToken,
    });
  }

  /**
   * Loads a user with their associated roles and permissions.
   * Throws if the user is not found.
   */
  async loadUserWithRolesAndPermissions(userId: string): Promise<AuthUser> {
    const userRows = await this.dbService.db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      throw new Error('User not found');
    }

    const userRolesData = await this.dbService.db
      .select({ roleName: schema.roles.name })
      .from(schema.userRoles)
      .innerJoin(schema.roles, eq(schema.userRoles.roleId, schema.roles.id))
      .where(eq(schema.userRoles.userId, userId));

    const roleNames = userRolesData.map(r => r.roleName);

    const permissionsData = await this.dbService.db
      .select({ permissionName: schema.permissions.name })
      .from(schema.userRoles)
      .innerJoin(schema.rolePermissions, eq(schema.userRoles.roleId, schema.rolePermissions.roleId))
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.userRoles.userId, userId));

    const permissionNames = [...new Set(permissionsData.map(p => p.permissionName))];

    return {
      id: user.id,
      email: user.email,
      roles: roleNames,
      permissions: permissionNames,
    };
  }
}
