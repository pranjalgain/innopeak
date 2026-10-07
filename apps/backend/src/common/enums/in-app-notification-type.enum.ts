/** Bell-icon feed vocabulary, deliberately separate from `notification_type` (the email/Teams delivery ledger). Only `REVIEW_ESCALATED` has a producer today. */
export enum InAppNotificationType {
  REVIEW_ESCALATED = 'review_escalated',
  REPLY_NEEDS_APPROVAL = 'reply_needs_approval',
  REPLY_APPROVED = 'reply_approved',
  CONNECTION_ISSUE = 'connection_issue',
}
