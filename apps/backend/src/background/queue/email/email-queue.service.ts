import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { APP_NAME } from '@common/constants/app.constants';
import { EmailService } from '@email/email.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(private readonly emailService: EmailService) {}

  async sendOtpEmail(data: IOtpEmailJob): Promise<void> {
    await this.send('OTP email', data.email, () =>
      this.emailService.sendTemplateEmail(
        data.email,
        'mfa-code',
        {
          name: data.customerName ?? 'User',
          code: String(data.otp),
          expiresIn: data.expiresIn ?? '10 minutes',
          appName: APP_NAME,
          year: new Date().getFullYear(),
        },
        // The code deliberately stays out of the subject: subject lines surface in lock-screen
        // notification previews and are logged by mail servers/relays, which retain them longer
        // and protect them less than message bodies. The body template already renders it.
        { subject: `Your ${APP_NAME} verification code` }
      )
    );
  }

  /** Shared debug/error logging around a single templated send — every job method uses this. */
  private async send(label: string, email: string, doSend: () => Promise<unknown>): Promise<void> {
    try {
      this.logger.debug(`Sending ${label} to ${email}`);
      await doSend();
      this.logger.debug(`${label} sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send ${label}: ${(error as Error).message}`);
      throw error;
    }
  }
}
