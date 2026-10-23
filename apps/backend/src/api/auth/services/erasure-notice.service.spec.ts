import { JobName } from '@bg/constants/job.constant';
import type { IErasureNoticeEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { ErasureNoticeService } from './erasure-notice.service';

describe('ErasureNoticeService', () => {
  let target: ErasureNoticeService;
  let authDb: Record<string, jest.Mock>;
  let queue: { addErasureNoticeEmailJob: jest.Mock; addErasurePurgeAlertEmailJob: jest.Mock };
  let admins: { findActiveAlertRecipients: jest.Mock };
  let config: Record<string, unknown>;

  const owner = {
    userId: 'u-jane',
    hasPassword: true,
    email: 'jane@acme.test',
    name: 'Jane',
    locale: 'de' as const,
  };
  const neverChose = {
    userId: 'u-bob',
    hasPassword: true,
    email: 'bob@acme.test',
    name: 'Bob',
    locale: null,
  };

  beforeEach(async () => {
    authDb = {
      findTenantOwnerRecipients: jest.fn().mockResolvedValue([owner, neverChose]),
      findTenantsDueForErasureReminder: jest.fn().mockResolvedValue([]),
      claimErasureReminder: jest.fn(),
      releaseErasureReminderClaim: jest.fn().mockResolvedValue(undefined),
      findTenantErasureState: jest.fn(),
    };
    queue = {
      addErasureNoticeEmailJob: jest.fn().mockResolvedValue(undefined),
      addErasurePurgeAlertEmailJob: jest.fn().mockResolvedValue(undefined),
    };
    admins = {
      findActiveAlertRecipients: jest.fn().mockResolvedValue([
        { email: 'root@innopeak.test', locale: null },
        { email: 'zoe@innopeak.test', locale: 'de' },
      ]),
    };
    config = { FRONTEND_URL: 'https://app.test/' };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ErasureNoticeService,
        { provide: AuthDbService, useValue: authDb },
        { provide: PlatformAdminDbService, useValue: admins },
        { provide: AddingJobsToQueueManager, useValue: queue },
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();
    target = moduleRef.get(ErasureNoticeService);
  });

  it('queues one scheduled notice per owner, each in their own language, with the deadline', async () => {
    await target.notifyScheduled({
      tenantId: 't1',
      businessName: 'Acme',
      requestedBy: 'owner',
    });

    expect(queue.addErasureNoticeEmailJob).toHaveBeenCalledTimes(2);
    const jobs = queue.addErasureNoticeEmailJob.mock.calls.map(c => c[1] as IErasureNoticeEmailJob);
    expect(queue.addErasureNoticeEmailJob.mock.calls[0]?.[0]).toBe(JobName.ERASURE_NOTICE_EMAIL);
    expect(jobs[0]).toMatchObject({
      kind: 'scheduled',
      email: 'jane@acme.test',
      locale: 'de',
      businessName: 'Acme',
      requestedBy: 'owner',
      loginUrl: 'https://app.test/login',
    });
    expect(jobs[1]).toMatchObject({ email: 'bob@acme.test', locale: 'en' });
    // default grace period is 21 days
    const days = (new Date(jobs[0]?.scheduledFor ?? 0).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(21);
  });

  it('never throws when recipients cannot be loaded or the queue is down', async () => {
    authDb['findTenantOwnerRecipients']!.mockRejectedValueOnce(new Error('db'));
    await expect(
      target.notifyScheduled({ tenantId: 't1', businessName: 'Acme', requestedBy: 'admin' })
    ).resolves.toBeUndefined();
    expect(queue.addErasureNoticeEmailJob).not.toHaveBeenCalled();

    queue.addErasureNoticeEmailJob.mockRejectedValue(new Error('redis'));
    await expect(
      target.notifyCancelled({ tenantId: 't1', businessName: 'Acme' })
    ).resolves.toBeUndefined();
  });

  it('sends the erased notice to the recipients it was handed, not to whoever is in the database now', async () => {
    await target.notifyErased({ recipients: [owner], businessName: 'Acme' });

    expect(authDb['findTenantOwnerRecipients']).not.toHaveBeenCalled();
    expect(queue.addErasureNoticeEmailJob).toHaveBeenCalledTimes(1);
    expect(queue.addErasureNoticeEmailJob.mock.calls[0]?.[1]).toMatchObject({ kind: 'erased' });
  });

  // The addresses are gone once the users are anonymized, so a notice that reached nobody cannot be resent.
  it('logs an error when the erased notice reached nobody', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await target.notifyErased({ recipients: [], businessName: 'Acme' });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('reached nobody'));
    errorSpy.mockRestore();
  });

  it('logs an error when every erased-notice enqueue failed', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    queue.addErasureNoticeEmailJob.mockRejectedValue(new Error('redis down'));

    await target.notifyErased({ recipients: [owner], businessName: 'Acme' });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('reached nobody'));
    errorSpy.mockRestore();
  });

  describe('notifyPurgeSkipped', () => {
    const skipped = [{ name: 'Acme', daysOverdue: 2, reason: 'stripe unreachable' }];

    it('mails every active platform admin in their own language', async () => {
      await target.notifyPurgeSkipped(skipped);

      expect(queue.addErasurePurgeAlertEmailJob).toHaveBeenCalledTimes(2);
      const jobs = queue.addErasurePurgeAlertEmailJob.mock.calls.map(call => call[1]);
      expect(queue.addErasurePurgeAlertEmailJob.mock.calls[0]?.[0]).toBe(
        JobName.ERASURE_PURGE_ALERT_EMAIL
      );
      expect(jobs[0]).toMatchObject({ email: 'root@innopeak.test', locale: 'en', skipped });
      expect(jobs[1]).toMatchObject({ email: 'zoe@innopeak.test', locale: 'de' });
    });

    it('does nothing when nothing was skipped', async () => {
      await target.notifyPurgeSkipped([]);

      expect(admins.findActiveAlertRecipients).not.toHaveBeenCalled();
      expect(queue.addErasurePurgeAlertEmailJob).not.toHaveBeenCalled();
    });

    it('never throws, and one failed enqueue does not stop the other admins', async () => {
      queue.addErasurePurgeAlertEmailJob.mockRejectedValueOnce(new Error('redis'));
      await expect(target.notifyPurgeSkipped(skipped)).resolves.toBeUndefined();
      expect(queue.addErasurePurgeAlertEmailJob).toHaveBeenCalledTimes(2);

      admins.findActiveAlertRecipients.mockRejectedValue(new Error('db'));
      await expect(target.notifyPurgeSkipped(skipped)).resolves.toBeUndefined();
    });
  });

  describe('sendDueReminders', () => {
    const requestedAt = '2026-10-01T00:00:00.000Z';

    it('reminds a claimed tenant once, attributing it from who requested the erasure', async () => {
      authDb['findTenantsDueForErasureReminder']!.mockResolvedValue([{ id: 't1' }]);
      authDb['claimErasureReminder']!.mockResolvedValue({
        name: 'Acme',
        erasureRequestedAt: requestedAt,
      });
      authDb['findTenantErasureState']!.mockResolvedValue({ erasureRequestedByUserId: 'u1' });

      await expect(target.sendDueReminders()).resolves.toBe(1);

      const job = queue.addErasureNoticeEmailJob.mock.calls[0]?.[1] as IErasureNoticeEmailJob;
      expect(job).toMatchObject({ kind: 'reminder', requestedBy: 'owner' });
      expect(job.scheduledFor).toBe('2026-10-22T00:00:00.000Z');
    });

    // The claim only exists so two runs cannot both send; burning it on a failed enqueue lost the reminder for good.
    it('hands the claim back when no reminder could be queued, so the next pass retries', async () => {
      authDb['findTenantsDueForErasureReminder']!.mockResolvedValue([{ id: 't1' }]);
      authDb['claimErasureReminder']!.mockResolvedValue({
        name: 'Acme',
        erasureRequestedAt: requestedAt,
      });
      authDb['findTenantErasureState']!.mockResolvedValue({ erasureRequestedByUserId: null });
      queue.addErasureNoticeEmailJob.mockRejectedValue(new Error('redis down'));

      await expect(target.sendDueReminders()).resolves.toBe(0);

      expect(authDb['releaseErasureReminderClaim']).toHaveBeenCalledWith('t1');
    });

    it('keeps the claim when the reminder was queued', async () => {
      authDb['findTenantsDueForErasureReminder']!.mockResolvedValue([{ id: 't1' }]);
      authDb['claimErasureReminder']!.mockResolvedValue({
        name: 'Acme',
        erasureRequestedAt: requestedAt,
      });
      authDb['findTenantErasureState']!.mockResolvedValue({ erasureRequestedByUserId: null });

      await expect(target.sendDueReminders()).resolves.toBe(1);

      expect(authDb['releaseErasureReminderClaim']).not.toHaveBeenCalled();
    });

    it('skips a tenant whose reminder another run already claimed', async () => {
      authDb['findTenantsDueForErasureReminder']!.mockResolvedValue([{ id: 't1' }]);
      authDb['claimErasureReminder']!.mockResolvedValue(null);

      await expect(target.sendDueReminders()).resolves.toBe(0);
      expect(queue.addErasureNoticeEmailJob).not.toHaveBeenCalled();
    });

    it('does nothing when the grace period is no longer than the reminder lead time', async () => {
      config['ERASURE_GRACE_PERIOD_DAYS'] = 3;

      await expect(target.sendDueReminders()).resolves.toBe(0);
      expect(authDb['findTenantsDueForErasureReminder']).not.toHaveBeenCalled();
    });

    it('carries on with the next tenant when one fails', async () => {
      authDb['findTenantsDueForErasureReminder']!.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
      authDb['claimErasureReminder']!.mockRejectedValueOnce(
        new Error('boom')
      ).mockResolvedValueOnce({ name: 'Beta', erasureRequestedAt: requestedAt });
      authDb['findTenantErasureState']!.mockResolvedValue({ erasureRequestedByUserId: null });

      await expect(target.sendDueReminders()).resolves.toBe(1);
    });
  });
});
