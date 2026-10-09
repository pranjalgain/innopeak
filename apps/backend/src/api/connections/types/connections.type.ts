import type { ProviderConnectionRow } from '@db/repositories/connections/types/connections.type';
import type {
  ProviderAccount,
  ProviderTokenSet,
} from '@review-provider/types/review-provider.type';

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

/** What waits in Redis while the owner picks between several Business Profile accounts. */
export interface PendingAccountChoice {
  /** Only this user may see or settle the choice. */
  userId: string;
  /** The screen that started the flow, where the owner lands once an account is chosen. */
  returnTo: ReturnTo;
  accounts: ProviderAccount[];
  /** The consented grant. Encrypted at rest in Redis, and only stored in the credential store once an account is chosen. */
  tokens: ProviderTokenSet;
}

/** How the OAuth callback proceeds with the accounts a grant manages. */
export type AccountDecision =
  { kind: 'account'; account: ProviderAccount } | { kind: 'choose' } | { kind: 'mismatch' };

export type ConnectAccountOutcome =
  { kind: 'connected'; connection: ProviderConnectionRow } | { kind: 'mismatch' };
