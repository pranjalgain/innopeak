import { Injectable, Logger } from '@nestjs/common';

import {
  AdminOverviewRepository,
  type PlatformActivityRow,
  type PlatformReviewStats,
  type RecordActivityInput,
} from './admin-overview.repository';

@Injectable()
export class AdminOverviewDbService {
  private readonly logger = new Logger(AdminOverviewDbService.name);

  constructor(private readonly adminOverviewRepository: AdminOverviewRepository) {}

  async getReviewStats(): Promise<PlatformReviewStats> {
    return this.adminOverviewRepository.getReviewStats();
  }

  /**
   * Never throws. Every caller records activity *after* its primary write has already committed
   * (suspending a business, creating or deleting an invite), and those two writes are not in one
   * transaction — so letting a failure here propagate would answer a request that genuinely
   * succeeded with a 500, telling the admin their action did not apply when it did. That is
   * strictly worse than a missing row in a display feed.
   *
   * Losing the entry is survivable precisely because this table is not the system of record: the
   * `log_db_changes()` triggers on `tenants` and `platform_admins` write the underlying row change
   * to `audit_logs` independently of anything here. This feed is the human-readable view on the
   * Overview page, so a dropped row costs a line of history, not the audit trail — and it is
   * logged at error level so it is still visible rather than silent.
   */
  async recordActivityBestEffort(input: RecordActivityInput): Promise<void> {
    try {
      await this.adminOverviewRepository.recordActivity(input);
    } catch (error) {
      this.logger.error(
        `Failed to record platform activity (${input.type}) for actor ${input.actorEmail}`,
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  async getRecentActivity(limit: number): Promise<PlatformActivityRow[]> {
    return this.adminOverviewRepository.getRecentActivity(limit);
  }
}
