import {
  IAdminInviteEmailJob,
  IErasureNoticeEmailJob,
  IErasurePurgeAlertEmailJob,
  ILocationsPausedEmailJob,
  IMemberInviteEmailJob,
  IOtpEmailJob,
} from '@bg/interfaces/job.interface';
import { APP_NAME } from '@common/constants/app.constants';
import { EmailService } from '@email/email.service';
import { buildErasureNotice, buildPurgeAlert } from '@email-queue/erasure-notice.copy';
import { buildLocationsPausedNotice } from '@email-queue/locations-paused.copy';
import { buildMemberInvite } from '@email-queue/member-invite.copy';
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
        // The code stays out of the subject: subjects show in lock-screen previews and mail servers retain them longer than bodies.
        { subject: `Your ${APP_NAME} verification code` }
      )
    );
  }

  async sendAdminInviteEmail(data: IAdminInviteEmailJob): Promise<void> {
    await this.send('admin invite email', data.email, () =>
      this.emailService.sendTemplateEmail(
        data.email,
        'admin-invite',
        {
          name: data.customerName ?? 'there',
          inviteUrl: data.inviteLink,
          expiresIn: data.expiresIn ?? '7 days',
          appName: APP_NAME,
          year: new Date().getFullYear(),
        },
        { subject: `You've been invited to ${APP_NAME}` }
      )
    );
  }

  /**
   * The subject names the inviting business rather than reusing the admin invite's wording: identical
   * subjects thread together in mail clients, and a business name is recognizable before opening.
   */
  async sendMemberInviteEmail(data: IMemberInviteEmailJob): Promise<void> {
    const content = buildMemberInvite(data, APP_NAME);
    await this.send('member invite email', data.email, () =>
      this.emailService.sendTemplateEmail(
        data.email,
        'erasure-notice',
        {
          lang: data.locale ?? 'en',
          title: content.title,
          body: content.body,
          actionText: content.actionText,
          actionUrl: content.actionUrl,
          appName: APP_NAME,
          year: new Date().getFullYear(),
        },
        { subject: content.subject }
      )
    );
  }

  /** The business name reaches the subject as plain text and the body escaped (see `buildErasureNotice`). */
  async sendErasureNoticeEmail(data: IErasureNoticeEmailJob): Promise<void> {
    const content = buildErasureNotice(data);
    await this.send(`erasure ${data.kind} email`, data.email, () =>
      this.emailService.sendTemplateEmail(
        data.email,
        'erasure-notice',
        {
          lang: data.locale,
          title: content.title,
          body: content.body,
          appName: APP_NAME,
          year: new Date().getFullYear(),
          ...(content.actionUrl
            ? { actionUrl: content.actionUrl, actionText: content.actionText }
            : {}),
        },
        { subject: content.subject }
      )
    );
  }

  async sendLocationsPausedEmail(data: ILocationsPausedEmailJob): Promise<void> {
    const content = buildLocationsPausedNotice(data);
    await this.send('locations paused email', data.email, () =>
      this.emailService.sendTemplateEmail(
        data.email,
        'notification',
        {
          lang: data.locale,
          title: content.title,
          body: content.body,
          actionText: content.actionText,
          actionUrl: content.actionUrl,
          appName: APP_NAME,
          year: new Date().getFullYear(),
        },
        { subject: content.subject }
      )
    );
  }

  async sendErasurePurgeAlertEmail(data: IErasurePurgeAlertEmailJob): Promise<void> {
    const content = buildPurgeAlert(data);
    await this.send('erasure purge alert email', data.email, () =>
      this.emailService.sendTemplateEmail(
        data.email,
        'erasure-notice',
        {
          lang: data.locale,
          title: content.title,
          body: content.body,
          appName: APP_NAME,
          year: new Date().getFullYear(),
        },
        { subject: content.subject }
      )
    );
  }

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
