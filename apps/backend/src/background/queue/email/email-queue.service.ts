import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { EmailService } from '@email/email.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(private readonly emailService: EmailService) {}

  async sendOtpEmail(data: IOtpEmailJob): Promise<void> {
    try {
      this.logger.debug(`Sending email verification to ${data.email} with token ${data.otp}`);

      await this.emailService.sendTemplateEmail(
        data.email,
        'mfa-code',
        {
          name: data.customerName ?? 'User',
          code: String(data.otp),
          expiresIn: '10 minutes',
          appName: 'NestJS App',
          year: new Date().getFullYear(),
        },
        {
          subject: `Your verification code: ${data.otp}`,
        }
      );

      this.logger.debug(`OTP email sent successfully to ${data.email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email: ${(error as Error).message}`);
      throw error;
    }
  }
}
