import { ICronJob } from '@bg/interfaces/job.interface';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly authDbService: AuthDbService) {}

  sendDailyMail(data?: ICronJob): void {
    this.logger.debug('Sending Daily mail', data);
  }

  /**
   * Nothing reads a consumed verify_email code or a revoked/expired refresh token ever again
   * (`consumeVerifyEmailToken` and `findActiveRefreshToken` both exclude them), so without this
   * both tables only ever grow — one refresh_tokens row per session ever started, forever.
   */
  async purgeStaleAuthTokens(): Promise<void> {
    const purged = await this.authDbService.purgeStaleTokens();
    this.logger.log(
      `Purged ${purged.verifyEmailTokens} stale verify_email token(s) and ${purged.refreshTokens} stale refresh token(s)`
    );
  }
}
