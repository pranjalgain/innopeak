import { Injectable } from '@nestjs/common';

import { AdminUsersRepository } from './admin-users.repository';
import type { AdminUserRow, ToggleActiveResult } from './types/admin-users.type';

@Injectable()
export class AdminUsersDbService {
  constructor(private readonly adminUsersRepository: AdminUsersRepository) {}

  async findPage(input: {
    search?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<{ rows: AdminUserRow[]; total: number }> {
    return this.adminUsersRepository.findPage(input);
  }

  async count(): Promise<number> {
    return this.adminUsersRepository.count();
  }

  // Two round trips (toggle, then re-read for the joined columns); a rare admin action, not worth one query.
  async toggleActive(userId: string, target?: boolean): Promise<ToggleActiveResult> {
    const outcome = await this.adminUsersRepository.toggleActive(userId, target);
    if (outcome.outcome !== 'toggled' && outcome.outcome !== 'unchanged') {
      return outcome;
    }
    const row = await this.adminUsersRepository.findById(userId);
    return row ? { outcome: outcome.outcome, row } : { outcome: 'not_found' };
  }
}
