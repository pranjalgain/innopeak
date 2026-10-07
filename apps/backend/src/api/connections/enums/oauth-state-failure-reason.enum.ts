/** Internal diagnostics only: all map to the same `INVALID_STATE` redirect code so a probing caller learns nothing about which layer rejected it. */
export enum OAuthStateFailureReason {
  EXPIRED = 'expired',
  INVALID_SIGNATURE = 'invalid_signature',
  SID_MISMATCH = 'sid_mismatch',
  UNKNOWN_NONCE = 'unknown_nonce',
}
