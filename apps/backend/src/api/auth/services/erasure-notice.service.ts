import { JobName } from '@bg/constants/job.constant';
import type {
  ErasureNoticeKind,
  IErasureNoticeEmailJob,
  IErasurePurgeAlertEmailJob,
  IPurgeSkippedBusiness,
} from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import {
  ERASURE_REMINDER_DAYS_BEFORE,
  getErasureGracePeriodDays,
} from '@common/constants/erasure.constants';
import { DEFAULT_LOCALE } from '@common/i18n/locale';
import { EnvConfig } from '@config/env.config';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { ErasureNoticeRecipient } from '@db/repositories/auth/types/auth.type';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ErasureRequestedBy = 'admin' | 'owner';

interface SendInput {
  kind: ErasureNoticeKind;
  recipients: ErasureNoticeRecipient[];
  businessName: string;
  requestedBy: ErasureRequestedBy;
  /** The user who asked, when an owner did — decides who can restore. */
  requesterUserId?: string | null;
  scheduledFor?: string;
}

/**
 * One queue job per recipient so each mail is in that person's own language. Entirely best-effort:
 * nothing here may fail or roll back the erasure, restore or purge it reports on, so every public
 * method swallows and logs its own errors.
 */
@Injectable()
export class ErasureNoticeService {
  private readonly logger = new Logger(ErasureNoticeService.name);

  constructor(
    private readonly authDbService: AuthDbService,
    private readonly platformAdminDbService: PlatformAdminDbService,
    private readonly queueManager: AddingJobsToQueueManager,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  /** Owners to tell. Call this *before* anything that anonymizes them (the purge). */
  async findRecipients(tenantId: string): Promise<ErasureNoticeRecipient[]> {
    try {
      return await this.authDbService.findTenantOwnerRecipients(tenantId);
    } catch (error) {
      this.logger.warn(
        `Could not load erasure-notice recipients for tenant ${tenantId}: ${(error as Error).message}`
      );
      return [];
    }
  }

  async notifyScheduled(input: {
    tenantId: string;
    businessName: string;
    requestedBy: ErasureRequestedBy;
    requesterUserId?: string | null;
  }): Promise<void> {
    const scheduledFor = new Date(
      Date.now() + getErasureGracePeriodDays(this.configService) * 86_400_000
    ).toISOString();
    await this.send({
      kind: 'scheduled',
      recipients: await this.findRecipients(input.tenantId),
      businessName: input.businessName,
      requestedBy: input.requestedBy,
      requesterUserId: input.requesterUserId ?? null,
      scheduledFor,
    });
  }

  async notifyCancelled(input: { tenantId: string; businessName: string }): Promise<void> {
    await this.send({
      kind: 'cancelled',
      recipients: await this.findRecipients(input.tenantId),
      businessName: input.businessName,
      requestedBy: 'owner',
    });
  }

  /**
   * `recipients` must be read before the purge anonymizes the users. This is the only chance to say it: the addresses are gone once
   * the users are anonymized, so a notice that reaches nobody is logged as an error rather than lost quietly.
   */
  async notifyErased(input: {
    recipients: ErasureNoticeRecipient[];
    businessName: string;
  }): Promise<void> {
    const { queued } = await this.send({
      kind: 'erased',
      recipients: input.recipients,
      businessName: input.businessName,
      requestedBy: 'owner',
    });
    if (queued === 0) {
      this.logger.error(
        `The "erased" notice reached nobody (${input.recipients.length} recipient(s) read before the purge, 0 queued); it cannot be sent later.`
      );
    }
  }

  /** A missed erasure deadline is a compliance problem and an error log line is easy to miss; sent every night it persists. */
  async notifyPurgeSkipped(skipped: IPurgeSkippedBusiness[]): Promise<void> {
    if (skipped.length === 0) {
      return;
    }
    try {
      const admins = await this.platformAdminDbService.findActiveAlertRecipients();
      for (const admin of admins) {
        const job: IErasurePurgeAlertEmailJob = {
          email: admin.email,
          locale: admin.locale ?? DEFAULT_LOCALE,
          skipped,
        };
        try {
          await this.queueManager.addErasurePurgeAlertEmailJob(
            JobName.ERASURE_PURGE_ALERT_EMAIL,
            job
          );
        } catch (error) {
          this.logger.warn(
            `Could not queue the purge alert for an admin: ${(error as Error).message}`
          );
        }
      }
    } catch (error) {
      this.logger.warn(`Could not send the purge alert: ${(error as Error).message}`);
    }
  }

  /** Each reminder is claimed in the database before it is queued, so overlapping runs cannot double-send. Returns the number reminded. */
  async sendDueReminders(): Promise<number> {
    const gracePeriodDays = getErasureGracePeriodDays(this.configService);
    if (gracePeriodDays <= ERASURE_REMINDER_DAYS_BEFORE) {
      return 0;
    }

    let reminded = 0;
    try {
      const due = await this.authDbService.findTenantsDueForErasureReminder({
        gracePeriodDays,
        reminderDaysBefore: ERASURE_REMINDER_DAYS_BEFORE,
      });

      for (const { id } of due) {
        try {
          const claimed = await this.authDbService.claimErasureReminder(id);
          if (!claimed) {
            continue;
          }
          const state = await this.authDbService.findTenantErasureState(id);
          const requestedBy: ErasureRequestedBy = state?.erasureRequestedByUserId
            ? 'owner'
            : 'admin';
          const recipients = await this.findRecipients(id);
          const { queued } = await this.send({
            kind: 'reminder',
            recipients,
            businessName: claimed.name,
            requestedBy,
            requesterUserId: state?.erasureRequestedByUserId ?? null,
            scheduledFor: new Date(
              new Date(claimed.erasureRequestedAt).getTime() + gracePeriodDays * 86_400_000
            ).toISOString(),
          });
          if (queued === 0 && recipients.length > 0) {
            // The claim only stops two runs both sending; nothing was sent, so hand it back for the next pass.
            await this.authDbService.releaseErasureReminderClaim(id);
            this.logger.warn(`Erasure reminder for tenant ${id} could not be queued; will retry.`);
            continue;
          }
          reminded += 1;
        } catch (error) {
          this.logger.warn(`Erasure reminder for tenant ${id} failed: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Erasure reminder pass failed: ${(error as Error).message}`);
    }
    return reminded;
  }

  /** Only the requesting owner can restore, and only with a password; see `cancelSelfRequestedErasure`. */
  private restoreFor(
    recipient: ErasureNoticeRecipient,
    input: SendInput
  ): IErasureNoticeEmailJob['restore'] {
    if (input.requestedBy !== 'owner') {
      return 'support';
    }
    if (recipient.userId !== input.requesterUserId) {
      return 'requester';
    }
    return recipient.hasPassword ? 'you' : 'support';
  }

  /** `queued` is how many recipients got a job; enqueue failures are logged and counted out, never thrown. */
  private async send(input: SendInput): Promise<{ queued: number }> {
    let queued = 0;
    const loginUrl = `${(this.configService.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '')}/login`;

    for (const recipient of input.recipients) {
      const job: IErasureNoticeEmailJob = {
        kind: input.kind,
        email: recipient.email,
        customerName: recipient.name,
        businessName: input.businessName,
        locale: recipient.locale ?? DEFAULT_LOCALE,
        requestedBy: input.requestedBy,
        restore: this.restoreFor(recipient, input),
        loginUrl,
        ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
      };
      try {
        await this.queueManager.addErasureNoticeEmailJob(JobName.ERASURE_NOTICE_EMAIL, job);
        queued += 1;
      } catch (error) {
        this.logger.warn(
          `Could not queue the erasure ${input.kind} email for a recipient: ${(error as Error).message}`
        );
      }
    }
    return { queued };
  }
}
