/**
 * The four values the frontend's reply-draft UI understands — a projection onto `ResponseStatus`
 * (`posted`/`post_failed` both fold into `approved`, since delivery is an implementation detail of
 * the same decision). An API-contract enum, not a DB column: `RESPONSE_STATUS_PROJECTION` in
 * `reviews.service.ts` is the exhaustive mapping from the DB values onto these.
 */
export enum ClientResponseStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUPERSEDED = 'superseded',
}
