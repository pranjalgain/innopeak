/** `in_app_notifications.type` — the bell-icon feed's own event vocabulary, deliberately separate
 *  from `notification_type` (which only ever has `escalation`, and drives the email/Teams
 *  delivery ledger, not the feed). Only `REVIEW_ESCALATED` has a real producer today — see
 *  apps/documentation/docs/backend/notifications/overview.md's MVP scope for the other three. */
export enum InAppNotificationType {
  REVIEW_ESCALATED = 'review_escalated',
  REPLY_NEEDS_APPROVAL = 'reply_needs_approval',
  REPLY_APPROVED = 'reply_approved',
  CONNECTION_ISSUE = 'connection_issue',
}
