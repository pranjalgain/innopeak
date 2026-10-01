import { Injectable } from '@nestjs/common';

import { AdminUsersRepository } from './admin-users.repository';
import type { AdminUserRow, ToggleActiveResult } from './types/admin-users.type';

@Injectable()
export class AdminUsersDbService {
  constructor(private readonly adminUsersRepository: AdminUsersRepository) {}

  async findAll(search?: string): Promise<AdminUserRow[]> {
    return this.adminUsersRepository.findAll(search);
  }

  /** Total non-anonymized user count — passed straight through, there is no row to map. */
  async count(): Promise<number> {
    return this.adminUsersRepository.count();
  }

  /**
   * Toggles the user's active status and returns the updated row (joined with `businessName`/
   * `lastLoginAt`) — the CAS in `toggleActive` and the re-read in `findById` are two round trips,
   * but a toggle happens at most a few times a day from one admin console, not a hot path worth
   * collapsing into one query.
   */
  async toggleActive(userId: string): Promise<ToggleActiveResult> {
    const outcome = await this.adminUsersRepository.toggleActive(userId);
    if (outcome.outcome !== 'toggled') {
      return outcome;
    }
    const row = await this.adminUsersRepository.findById(userId);
    return row ? { outcome: 'toggled', row } : { outcome: 'not_found' };
  }
}
