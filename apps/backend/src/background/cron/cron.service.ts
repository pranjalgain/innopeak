import { ICronJob } from '@bg/interfaces/job.interface';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  sendDailyMail(data?: ICronJob): void {
    this.logger.debug('Sending Daily mail', data);
  }
}
