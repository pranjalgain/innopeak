import { Injectable } from '@nestjs/common';

import { type AdminUserRow, AdminUsersRepository } from './admin-users.repository';

@Injectable()
export class AdminUsersDbService {
  constructor(private readonly adminUsersRepository: AdminUsersRepository) {}

  async findAll(): Promise<AdminUserRow[]> {
    return this.adminUsersRepository.findAll();
  }

  /**
   * Toggles the user's active status and returns the updated row (joined with `businessName`/
   * `lastLoginAt`), or `null` if no such user exists — the CAS in `toggleActive` and the re-read
   * in `findById` are two round trips, but a toggle happens at most a few times a day from one
   * admin console, not a hot path worth collapsing into one query.
   */
  async toggleActive(userId: string): Promise<AdminUserRow | null> {
    const updated = await this.adminUsersRepository.toggleActive(userId);
    if (!updated) {
      return null;
    }
    return this.adminUsersRepository.findById(userId);
  }
}
