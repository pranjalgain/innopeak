import type { InAppNotificationType } from '@common/enums/in-app-notification-type.enum';

/** What a producer reports. The service decides who hears about it, in which language, and whether a burst is folded into a summary. */
export type InAppNotificationEvent =
  | {
      type: InAppNotificationType.REPLY_APPROVED;
      reviewId: string;
      rating: number;
      /** The person who approved it, who is not told about their own action; null for an auto-approval, which tells everyone. */
      actorUserId?: string | null;
    }
  | {
      type: InAppNotificationType.REPLY_NEEDS_APPROVAL;
      reviewId: string;
      rating: number;
      /** Drafts generated together share one group, so they raise one notice; null for a lone draft. */
      generationGroupId?: string | null;
    }
  | { type: InAppNotificationType.CONNECTION_ISSUE }
  | { type: InAppNotificationType.REVIEW_ESCALATED; reviewId: string; rating: number };

/** One row-to-be per recipient: an event after bursts are folded, before the text is rendered. */
export interface PlannedNotice {
  type: InAppNotificationType;
  reviewId: string | null;
  generationGroupId: string | null;
  rating: number | null;
  /** Set on a summary notice: how many further events it stands for. */
  summaryCount: number | null;
  excludeUserId: string | null;
}
