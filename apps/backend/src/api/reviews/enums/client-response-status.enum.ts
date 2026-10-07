/** API-contract projection of `ResponseStatus` (`posted`/`post_failed` fold into `approved`), not a DB column; see `RESPONSE_STATUS_PROJECTION`. */
export enum ClientResponseStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUPERSEDED = 'superseded',
}
