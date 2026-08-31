import { DBService } from '@db/db.service';
import { roles, userRoles, users } from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { UserProfile } from '@users/interfaces/user.interface';
import { and, count, eq, isNull, sql } from 'drizzle-orm';

@Injectable()
export class UsersRepository {
  constructor(private readonly dbService: DBService) {}

  async findById(id: string): Promise<UserProfile | null> {
    const rows = await this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        isActive: users.isActive,
        isEmailVerified: users.isEmailVerified,
        mfaEnabled: users.mfaEnabled,
        createdAt: users.createdAt,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowsToUserProfile(rows);
  }

  async findByEmail(email: string): Promise<UserProfile | null> {
    const rows = await this.dbService.db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        isActive: users.isActive,
        isEmailVerified: users.isEmailVerified,
        mfaEnabled: users.mfaEnabled,
        createdAt: users.createdAt,
        roleName: roles.name,
      })
      .from(users)
      .leftJoin(userRoles, eq(users.id, userRoles.userId))
      .leftJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(users.email, email), isNull(users.deletedAt)));

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowsToUserProfile(rows);
  }

  async findAll(page: number, pageSize: number): Promise<{ data: UserProfile[]; total: number }> {
    const offset = (page - 1) * pageSize;

    const [totalResult, userRows] = await Promise.all([
      this.dbService.db.select({ count: count() }).from(users).where(isNull(users.deletedAt)),
      this.dbService.db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          isActive: users.isActive,
          isEmailVerified: users.isEmailVerified,
          mfaEnabled: users.mfaEnabled,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(isNull(users.deletedAt))
        .orderBy(users.createdAt)
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;

    // Fetch roles for all users in the page
    const userIds = userRows.map(u => u.id);

    if (userIds.length === 0) {
      return { data: [], total };
    }

    const roleRows = await this.dbService.db
      .select({
        userId: userRoles.userId,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(sql`${userRoles.userId} IN ${userIds}`);

    // Group roles by userId
    const rolesByUserId = new Map<string, string[]>();
    for (const row of roleRows) {
      const existing = rolesByUserId.get(row.userId);
      if (existing) {
        existing.push(row.roleName);
      } else {
        rolesByUserId.set(row.userId, [row.roleName]);
      }
    }

    const data: UserProfile[] = userRows.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      phone: user.phone ?? null,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      mfaEnabled: user.mfaEnabled,
      roles: rolesByUserId.get(user.id) ?? [],
      createdAt: user.createdAt,
    }));

    return { data, total };
  }

  async update(
    id: string,
    data: Partial<{ firstName: string; lastName: string; phone: string }>
  ): Promise<UserProfile | null> {
    const result = await this.dbService.db
      .update(users)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (result.length === 0) {
      return null;
    }

    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.dbService.db
      .update(users)
      .set({
        deletedAt: sql`now()`,
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
  }

  private mapRowsToUserProfile(
    rows: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      isActive: boolean;
      isEmailVerified: boolean;
      mfaEnabled: boolean;
      createdAt: Date;
      roleName: string | null;
    }[]
  ): UserProfile {
    const first = rows[0];
    if (!first) {
      throw new Error('mapRowsToUserProfile called with an empty rows array');
    }
    const userRoleNames: string[] = [];

    for (const row of rows) {
      if (row.roleName !== null) {
        userRoleNames.push(row.roleName);
      }
    }

    return {
      id: first.id,
      email: first.email,
      firstName: first.firstName,
      lastName: first.lastName,
      phone: first.phone,
      isActive: first.isActive,
      isEmailVerified: first.isEmailVerified,
      mfaEnabled: first.mfaEnabled,
      roles: userRoleNames,
      createdAt: first.createdAt,
    };
  }
}
