import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { NotificationsDbService } from '@db/repositories/notifications/notifications.db-service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import {
  InAppNotificationsService,
  MAX_INDIVIDUAL_NOTICES_PER_TYPE,
  planNotices,
} from './in-app-notifications.service';

import { NotificationEventBus } from '../realtime/notification-event-bus.service';
import type { InAppNotificationEvent } from '../types/in-app-notification-event.type';

const escalated = (n: number): InAppNotificationEvent => ({
  type: InAppNotificationType.REVIEW_ESCALATED,
  reviewId: `review-${n}`,
  rating: 1,
});

describe('InAppNotificationsService', () => {
  let target: InAppNotificationsService;
  let notificationsDbService: { listActiveRecipients: jest.Mock; insertMany: jest.Mock };
  let eventBus: { publish: jest.Mock };

  beforeEach(async () => {
    notificationsDbService = {
      listActiveRecipients: jest.fn().mockResolvedValue([
        { id: 'user-en', locale: 'en' },
        { id: 'user-de', locale: 'de' },
        { id: 'user-none', locale: null },
      ]),
      insertMany: jest.fn().mockResolvedValue([]),
    };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InAppNotificationsService,
        { provide: NotificationsDbService, useValue: notificationsDbService },
        { provide: NotificationEventBus, useValue: eventBus },
      ],
    }).compile();

    target = module.get(InAppNotificationsService);
  });

  const writtenRows = (): Array<Record<string, unknown>> =>
    notificationsDbService.insertMany.mock.calls[0]?.[0] as Array<Record<string, unknown>>;

  it('does nothing for an empty batch', async () => {
    await target.publish('tenant-1', []);

    expect(notificationsDbService.listActiveRecipients).not.toHaveBeenCalled();
    expect(notificationsDbService.insertMany).not.toHaveBeenCalled();
  });

  it('writes one row per active user, in that user’s language, defaulting to English', async () => {
    await target.publish('tenant-1', [escalated(1)]);

    const rows = writtenRows();
    expect(rows).toHaveLength(3);
    expect(rows.find(row => row['userId'] === 'user-en')).toMatchObject({
      tenantId: 'tenant-1',
      type: InAppNotificationType.REVIEW_ESCALATED,
      title: 'Review escalated',
      reviewId: 'review-1',
    });
    expect(rows.find(row => row['userId'] === 'user-de')).toMatchObject({
      title: 'Bewertung eskaliert',
    });
    expect(rows.find(row => row['userId'] === 'user-none')).toMatchObject({
      title: 'Review escalated',
    });
  });

  it('puts the rating in the description', async () => {
    await target.publish('tenant-1', [escalated(1)]);

    expect(writtenRows()[0]?.['description']).toContain('1-star');
  });

  // A NULL group never conflicts in the unique index, so an escalation carries a fixed one per review: a repeat is then a no-op.
  it('gives an escalation the same group every time for the same review, and a different one for another', async () => {
    await target.publish('tenant-1', [escalated(1)]);
    await target.publish('tenant-1', [escalated(1), escalated(2)]);

    const first = (
      notificationsDbService.insertMany.mock.calls[0]?.[0] as Array<Record<string, unknown>>
    )[0];
    const second = notificationsDbService.insertMany.mock.calls[1]?.[0] as Array<
      Record<string, unknown>
    >;
    expect(first?.['generationGroupId']).toEqual(expect.any(String));
    expect(second.find(row => row['reviewId'] === 'review-1')?.['generationGroupId']).toBe(
      first?.['generationGroupId']
    );
    expect(second.find(row => row['reviewId'] === 'review-2')?.['generationGroupId']).not.toBe(
      first?.['generationGroupId']
    );
  });

  it('writes nothing when the tenant has no active users', async () => {
    notificationsDbService.listActiveRecipients.mockResolvedValue([]);

    await target.publish('tenant-1', [escalated(1)]);

    expect(notificationsDbService.insertMany).not.toHaveBeenCalled();
  });

  it('does not tell the person who approved a reply about their own action', async () => {
    await target.publish('tenant-1', [
      {
        type: InAppNotificationType.REPLY_APPROVED,
        reviewId: 'review-1',
        rating: 5,
        actorUserId: 'user-de',
      },
    ]);

    expect(writtenRows().map(row => row['userId'])).toEqual(['user-en', 'user-none']);
  });

  it('tells everyone about an auto-approval, which has no author', async () => {
    await target.publish('tenant-1', [
      { type: InAppNotificationType.REPLY_APPROVED, reviewId: 'review-1', rating: 5 },
    ]);

    expect(writtenRows()).toHaveLength(3);
  });

  it('writes a connection notice with no review', async () => {
    await target.notifyConnectionIssue('tenant-1');

    expect(writtenRows()[0]).toMatchObject({
      type: InAppNotificationType.CONNECTION_ISSUE,
      reviewId: null,
      title: 'Google connection needs attention',
    });
  });

  it('keeps the group id so drafts generated together raise one notice', async () => {
    await target.publish('tenant-1', [
      {
        type: InAppNotificationType.REPLY_NEEDS_APPROVAL,
        reviewId: 'review-1',
        rating: 2,
        generationGroupId: 'group-1',
      },
    ]);

    expect(writtenRows()[0]).toMatchObject({ generationGroupId: 'group-1' });
  });

  describe('telling open streams', () => {
    it('publishes who has something new, using the ids of the rows actually written', async () => {
      notificationsDbService.insertMany.mockResolvedValue([
        { id: 'notice-1', userId: 'user-en' },
        { id: 'notice-2', userId: 'user-de' },
      ]);

      await target.publish('tenant-1', [escalated(1)]);

      expect(eventBus.publish).toHaveBeenCalledWith([
        { userId: 'user-en', notificationId: 'notice-1' },
        { userId: 'user-de', notificationId: 'notice-2' },
      ]);
    });

    it('publishes nothing for rows a conflict skipped', async () => {
      notificationsDbService.insertMany.mockResolvedValue([]);

      await target.publish('tenant-1', [escalated(1)]);

      expect(eventBus.publish).toHaveBeenCalledWith([]);
    });

    it('does not publish when the insert failed, so a browser is never told about a row that is not there', async () => {
      notificationsDbService.insertMany.mockRejectedValue(new Error('db down'));

      await target.publish('tenant-1', [escalated(1)]);

      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  // A notice is a courtesy: it must never break the review pipeline or the request that raised it.
  it.each(['recipients lookup', 'insert'])('swallows a failed %s', async stage => {
    if (stage === 'insert') {
      notificationsDbService.insertMany.mockRejectedValue(new Error('db down'));
    } else {
      notificationsDbService.listActiveRecipients.mockRejectedValue(new Error('db down'));
    }

    await expect(target.publish('tenant-1', [escalated(1)])).resolves.toBeUndefined();
  });
});

describe('planNotices', () => {
  it('keeps a small burst as it is', () => {
    const planned = planNotices(
      Array.from({ length: MAX_INDIVIDUAL_NOTICES_PER_TYPE }, (_, i) => escalated(i))
    );

    expect(planned).toHaveLength(MAX_INDIVIDUAL_NOTICES_PER_TYPE);
    expect(planned.every(notice => notice.summaryCount === null)).toBe(true);
  });

  it('shows the first few of a larger burst and folds the rest into one summary', () => {
    const planned = planNotices(Array.from({ length: 12 }, (_, i) => escalated(i)));

    expect(planned).toHaveLength(MAX_INDIVIDUAL_NOTICES_PER_TYPE + 1);
    expect(planned.at(-1)).toMatchObject({
      type: InAppNotificationType.REVIEW_ESCALATED,
      reviewId: null,
      summaryCount: 12 - MAX_INDIVIDUAL_NOTICES_PER_TYPE,
    });
  });

  it('folds each type on its own', () => {
    const planned = planNotices([
      ...Array.from({ length: 7 }, (_, i) => escalated(i)),
      { type: InAppNotificationType.REPLY_NEEDS_APPROVAL, reviewId: 'review-x', rating: 2 },
    ]);

    expect(planned.filter(notice => notice.summaryCount !== null)).toHaveLength(1);
    expect(
      planned.filter(notice => notice.type === InAppNotificationType.REPLY_NEEDS_APPROVAL)
    ).toHaveLength(1);
  });

  it('folds a burst of auto-approvals too, but never connection issues', () => {
    const approvals = planNotices(
      Array.from({ length: 9 }, (_, i) => ({
        type: InAppNotificationType.REPLY_APPROVED as const,
        reviewId: `review-${i}`,
        rating: 5,
      }))
    );
    const connection = planNotices(
      Array.from({ length: 9 }, () => ({ type: InAppNotificationType.CONNECTION_ISSUE as const }))
    );

    expect(approvals).toHaveLength(MAX_INDIVIDUAL_NOTICES_PER_TYPE + 1);
    expect(connection).toHaveLength(9);
  });

  describe('who a summary is hidden from', () => {
    const approvedBy = (actorUserId: string | null, index: number) => ({
      type: InAppNotificationType.REPLY_APPROVED as const,
      reviewId: `review-${index}`,
      rating: 5,
      actorUserId,
    });
    const summaryOf = (events: ReturnType<typeof approvedBy>[]) =>
      planNotices(events).find(notice => notice.summaryCount !== null);

    it('hides it from the approver when every folded approval was theirs', () => {
      const summary = summaryOf(Array.from({ length: 9 }, (_, i) => approvedBy('user-1', i)));

      expect(summary?.excludeUserId).toBe('user-1');
    });

    it('shows it to everyone when the folded approvals have different approvers', () => {
      const summary = summaryOf(
        Array.from({ length: 9 }, (_, i) => approvedBy(i % 2 === 0 ? 'user-1' : 'user-2', i))
      );

      expect(summary?.excludeUserId).toBeNull();
    });

    it('shows it to everyone when an approval had no approver (an auto-approval)', () => {
      const summary = summaryOf(
        Array.from({ length: 9 }, (_, i) => approvedBy(i === 8 ? null : 'user-1', i))
      );

      expect(summary?.excludeUserId).toBeNull();
    });
  });
});
