/** The normalized profile the callback works with, whatever provider implementation produced it. */
export interface GoogleIdentity {
  /**
   * Google's stable subject id. The identity key, deliberately not the email — an email can be
   * reassigned within a Workspace domain, `sub` never is, which is why
   * `idx_user_identities_provider_provider_user_id` is unique on `(provider, provider_user_id)`.
   */
  providerUserId: string;
  email: string;
  /** Google's own claim. A false value is refused rather than trusted — see the callback. */
  emailVerified: boolean;
  /** The person's display name. Absent on some accounts, so the caller falls back to the email. */
  name: string | null;
}

export interface GoogleAuthorizeRequest {
  state: string;
}

export interface GoogleCallbackRequest {
  code: string;
}
