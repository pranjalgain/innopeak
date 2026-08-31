import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';

@Injectable()
export class AuthRepository {
  constructor(private readonly dbService: DBService) {}

  async findUserByEmail(email: string): Promise<{
    id: string;
    email: string;
    passwordHash: string | null;
    isActive: boolean;
  } | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        passwordHash: schema.users.passwordHash,
        isActive: schema.users.isActive,
      })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    return rows[0] ?? null;
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
  }): Promise<string> {
    const rows = await this.dbService.db
      .insert(schema.users)
      .values({
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        isActive: true,
      })
      .returning({ id: schema.users.id });

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to create user');
    }

    return row.id;
  }

  async assignRole(userId: string, roleName: string): Promise<void> {
    const roleRows = await this.dbService.db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.name, roleName))
      .limit(1);

    const role = roleRows[0];
    if (role) {
      await this.dbService.db.insert(schema.userRoles).values({
        userId,
        roleId: role.id,
      });
    }
  }

  async getUserWithRolesAndPermissions(userId: string): Promise<AuthUser> {
    const userRows = await this.dbService.db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    const user = userRows[0];
    if (!user) {
      throw new NotFoundException('User not found');
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

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.dbService.db
      .update(schema.users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));
  }

  async findUserById(userId: string): Promise<{ id: string; passwordHash: string | null } | null> {
    const rows = await this.dbService.db
      .select({
        id: schema.users.id,
        passwordHash: schema.users.passwordHash,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    return rows[0] ?? null;
  }
}
