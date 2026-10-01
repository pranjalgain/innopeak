import type { OAuthStateFailureReason } from '../enums/oauth-state-failure-reason.enum';
import type { ReturnTo } from '../enums/return-to.enum';

export interface AuthorizeResult {
  authorizationUrl: string;
  /** Set as the browser-binding cookie by the controller. */
  sid: string;
}

export interface CallbackInput {
  code?: string | undefined;
  state?: string | undefined;
  error?: string | undefined;
  sid?: string | undefined;
}

// ─── OAuth state ──────────────────────────────────────────────────────────────

/** Everything the callback's write path needs. Read from Redis, never from the client's blob. */
export interface OAuthStateRecord {
  tenantId: string;
  userId: string;
  returnTo: ReturnTo;
  /** SHA-256 of the browser-binding cookie value. The cookie itself is never stored. */
  sidHash: string;
}

export interface MintedState {
  /** Goes to Google as the `state` query param. */
  state: string;
  /** Goes to the browser as the `gbp_oauth_sid` cookie. */
  sid: string;
}

export type ConsumeResult =
  { ok: false; reason: OAuthStateFailureReason } | { ok: true; record: OAuthStateRecord };
