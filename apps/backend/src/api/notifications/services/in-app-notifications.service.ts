import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { NotificationsDbService } from '@db/repositories/notifications/notifications.db-service';
import type { InsertInAppNotificationInput } from '@db/repositories/notifications/types/notifications.type';
import { Injectable, Logger } from '@nestjs/common';

import { NotificationEventBus } from '../realtime/notification-event-bus.service';
import type {
  InAppNotificationEvent,
  PlannedNotice,
} from '../types/in-app-notification-event.type';
import { deterministicUuid } from '../utils/deterministic-uuid.util';
import {
  buildNotificationCopy,
  resolveNotificationLocale,
} from '../utils/in-app-notification-copy.util';

/**
 * A run that produces more of one kind than this (a first backfill escalating or auto-replying to dozens of old reviews) shows the first few and one
 * summary for the rest, so the bell is not buried the moment a business connects.
 */
export const MAX_INDIVIDUAL_NOTICES_PER_TYPE = 5;

const FOLDED_TYPES: ReadonlySet<InAppNotificationType> = new Set([
  InAppNotificationType.REVIEW_ESCALATED,
  InAppNotificationType.REPLY_NEEDS_APPROVAL,
  InAppNotificationType.REPLY_APPROVED,
]);

/**
 * Writes bell-feed entries for every active user of a tenant. Called by the producers (classification, AI drafting, approval,
 * connection health) in whichever process they run, API or worker.
 *
 * `publish` never throws: a notice is a courtesy, so a failed insert is logged and dropped rather than failing the review pipeline or
 * the request that triggered it.
 */
@Injectable()
export class InAppNotificationsService {
  private readonly logger = new Logger(InAppNotificationsService.name);

  constructor(
    private readonly notificationsDbService: NotificationsDbService,
    private readonly notificationEventBus: NotificationEventBus
  ) {}

  /** Every event reaches every active user of the tenant, except an approval's own author. */
  async publish(tenantId: string, events: InAppNotificationEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    try {
      const recipients = await this.notificationsDbService.listActiveRecipients(tenantId);
      if (recipients.length === 0) {
        return;
      }

      const notices = planNotices(events);
      const rows: InsertInAppNotificationInput[] = [];
      for (const recipient of recipients) {
        const locale = resolveNotificationLocale(recipient.locale);
        for (const notice of notices) {
          if (notice.excludeUserId === recipient.id) {
            continue;
          }
          const copy = buildNotificationCopy(locale, notice);
          rows.push({
            tenantId,
            userId: recipient.id,
            type: notice.type,
            title: copy.title,
            description: copy.description,
            reviewId: notice.reviewId,
            generationGroupId: notice.generationGroupId,
          });
        }
      }

      const written = await this.notificationsDbService.insertMany(rows);

      // After the rows exist, so a browser told "something new" always finds it. The bus never throws and a missed message costs one poll.
      await this.notificationEventBus.publish(
        written.map(row => ({ userId: row.userId, notificationId: row.id }))
      );
    } catch (error) {
      this.logger.error(
        `Could not write ${events.length} in-app notice(s) for tenant ${tenantId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  notifyConnectionIssue(tenantId: string): Promise<void> {
    return this.publish(tenantId, [{ type: InAppNotificationType.CONNECTION_ISSUE }]);
  }
}

function toNotice(event: InAppNotificationEvent): PlannedNotice {
  switch (event.type) {
    case InAppNotificationType.REVIEW_ESCALATED:
      return {
        type: event.type,
        reviewId: event.reviewId,
        // One escalation notice per review per user, however often the review is classified again (a retried or crashed run): a
        // fixed group makes the unique index do the de-duplication, where a NULL group never would.
        generationGroupId: deterministicUuid(`review-escalated:${event.reviewId}`),
        rating: event.rating,
        summaryCount: null,
        excludeUserId: null,
      };
    case InAppNotificationType.REPLY_NEEDS_APPROVAL:
      return {
        type: event.type,
        reviewId: event.reviewId,
        generationGroupId: event.generationGroupId ?? null,
        rating: event.rating,
        summaryCount: null,
        excludeUserId: null,
      };
    case InAppNotificationType.REPLY_APPROVED:
      return {
        type: event.type,
        reviewId: event.reviewId,
        generationGroupId: null,
        rating: event.rating,
        summaryCount: null,
        excludeUserId: event.actorUserId ?? null,
      };
    case InAppNotificationType.CONNECTION_ISSUE:
      return {
        type: event.type,
        reviewId: null,
        generationGroupId: null,
        rating: null,
        summaryCount: null,
        excludeUserId: null,
      };
  }
}

/** Exported for tests. Keeps the first few of a burst and folds the rest of that type into one summary notice. */
export function planNotices(events: InAppNotificationEvent[]): PlannedNotice[] {
  const planned: PlannedNotice[] = [];
  const seenPerType = new Map<InAppNotificationType, number>();
  // Whom the folded events must not be shown to. A summary stands for every event folded into it, so it only skips a person when all of
  // them were that person's own doing (a null entry, an event with nobody to skip, keeps the summary for everyone).
  const foldedExclusions = new Map<InAppNotificationType, Array<string | null>>();

  for (const event of events) {
    const seen = seenPerType.get(event.type) ?? 0;
    seenPerType.set(event.type, seen + 1);

    if (!FOLDED_TYPES.has(event.type) || seen < MAX_INDIVIDUAL_NOTICES_PER_TYPE) {
      planned.push(toNotice(event));
    } else {
      const exclusions = foldedExclusions.get(event.type) ?? [];
      exclusions.push(toNotice(event).excludeUserId);
      foldedExclusions.set(event.type, exclusions);
    }
  }

  for (const [type, seen] of seenPerType) {
    if (FOLDED_TYPES.has(type) && seen > MAX_INDIVIDUAL_NOTICES_PER_TYPE) {
      const [first, ...rest] = foldedExclusions.get(type) ?? [];
      planned.push({
        type,
        reviewId: null,
        generationGroupId: null,
        rating: null,
        summaryCount: seen - MAX_INDIVIDUAL_NOTICES_PER_TYPE,
        excludeUserId: first !== undefined && rest.every(other => other === first) ? first : null,
      });
    }
  }

  return planned;
}
