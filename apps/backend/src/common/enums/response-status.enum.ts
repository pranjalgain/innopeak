/** `review_responses.status`. `draft` -> `pending_approval` -> `approved`/`rejected`/`superseded`
 * -> `posted`/`post_failed`, with `posted` -> `superseded` on a later edit (PLAN.md §4.2). */
export enum ResponseStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  POSTED = 'posted',
  POST_FAILED = 'post_failed',
  SUPERSEDED = 'superseded',
}
