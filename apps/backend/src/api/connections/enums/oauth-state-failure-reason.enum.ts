/**
 * Why an OAuth `state` verification failed. Internal diagnostics only — every one of these maps
 * to the same `INVALID_STATE` code on the redirect, deliberately, so a probing caller learns
 * nothing about which layer rejected it.
 */
export enum OAuthStateFailureReason {
  EXPIRED = 'expired',
  INVALID_SIGNATURE = 'invalid_signature',
  SID_MISMATCH = 'sid_mismatch',
  UNKNOWN_NONCE = 'unknown_nonce',
}
