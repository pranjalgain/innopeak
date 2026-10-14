import { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from '@common/i18n/locale';
import type { MessageCatalog } from '@common/i18n/message-catalog.type';
import { messagesDe } from '@common/i18n/messages.de';
import { messagesEn } from '@common/i18n/messages.en';

import type { PlannedNotice } from '../types/in-app-notification-event.type';

export interface NotificationCopy {
  title: string;
  description: string;
}

const CATALOGS: Record<Locale, MessageCatalog> = { en: messagesEn, de: messagesDe };

/** A user who has not chosen a language, or one this server no longer supports, reads the default. */
export function resolveNotificationLocale(locale: string | null): Locale {
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * Rendered straight from the catalogs (not the tagged `MESSAGES`): the text is stored on the row in the recipient's language, so
 * it is final by the time it is written. A rating-less event cannot occur for the review types, but 0 keeps this total.
 */
export function buildNotificationCopy(locale: Locale, notice: PlannedNotice): NotificationCopy {
  const feed = CATALOGS[locale].NOTIFICATIONS.FEED;
  const rating = notice.rating ?? 0;
  const summary = notice.summaryCount;

  switch (notice.type) {
    case InAppNotificationType.REVIEW_ESCALATED:
      return summary === null
        ? {
            title: feed.REVIEW_ESCALATED_TITLE,
            description: feed.REVIEW_ESCALATED_DESCRIPTION(rating),
          }
        : {
            title: feed.REVIEW_ESCALATED_SUMMARY_TITLE(summary),
            description: feed.REVIEW_ESCALATED_SUMMARY_DESCRIPTION,
          };
    case InAppNotificationType.REPLY_NEEDS_APPROVAL:
      return summary === null
        ? {
            title: feed.REPLY_NEEDS_APPROVAL_TITLE,
            description: feed.REPLY_NEEDS_APPROVAL_DESCRIPTION(rating),
          }
        : {
            title: feed.REPLY_NEEDS_APPROVAL_SUMMARY_TITLE(summary),
            description: feed.REPLY_NEEDS_APPROVAL_SUMMARY_DESCRIPTION,
          };
    case InAppNotificationType.REPLY_APPROVED:
      return summary === null
        ? {
            title: feed.REPLY_APPROVED_TITLE,
            description: feed.REPLY_APPROVED_DESCRIPTION(rating),
          }
        : {
            title: feed.REPLY_APPROVED_SUMMARY_TITLE(summary),
            description: feed.REPLY_APPROVED_SUMMARY_DESCRIPTION,
          };
    case InAppNotificationType.CONNECTION_ISSUE:
      return {
        title: feed.CONNECTION_ISSUE_TITLE,
        description: feed.CONNECTION_ISSUE_DESCRIPTION,
      };
  }
}
