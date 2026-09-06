import { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';
import { EmailProvider } from '@email/providers/email.provider';
import { Injectable, Logger } from '@nestjs/common';

import { randomUUID } from 'crypto';

/**
 * Non-production stands in for the real provider unconditionally (see EmailModule's factory) —
 * regardless of EMAIL_PROVIDER/SMTP_HOST, nothing actually leaves the process outside
 * production. Logs what would have been sent instead, so signup/verification flows are still
 * observable locally without risking a real inbox.
 */
@Injectable()
export class NoopEmailProvider extends EmailProvider {
  private readonly logger = new Logger(NoopEmailProvider.name);

  send(options: SendEmailOptions): Promise<EmailSendResult> {
    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    this.logger.log(`[dev] Email send skipped — to=${to}, subject="${options.subject}"`);

    return Promise.resolve({ messageId: `noop-${randomUUID()}` });
  }

  verify(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
