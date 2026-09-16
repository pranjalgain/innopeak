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
   * succeeded with a 500, telling the admin their action did not apply when it did. That is worse
   * than losing a line of this display feed: this table is now the only record of the action (no
   * generic audit trail behind it to fall back on), but failing a suspend/invite/disable that has
   * already taken effect over a logging hiccup would be a strictly worse outcome for the admin —
   * so a dropped entry is logged at error level, so it is still visible rather than silent, and
   * swallowed rather than surfaced as a failure of the action itself.
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
