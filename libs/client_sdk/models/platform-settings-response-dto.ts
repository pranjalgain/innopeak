// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PlatformSettingsResponseDto {
  /**
   * Whether the sign-in/sign-up screens offer the Microsoft SSO button.
   */
  microsoftLoginEnabled: boolean;
  /**
   * Whether email/password sign-in and sign-up are in effect: the stored switch, and an email service this server can deliver through. Off when either is missing, so a server with no email service never offers a sign-up whose code cannot be sent.
   */
  passwordLoginEnabled: boolean;
  /**
   * Whether the sign-in/sign-up screens offer Google social sign-in.
   */
  googleLoginEnabled: boolean;
  /**
   * Whether a tenant owner\'s Settings > Members tab can send invites.
   */
  inviteMembersEnabled: boolean;
  /**
   * Whether a tenant\'s Settings screen offers notification channel preferences (the Notifications tab). Off by default: phase one delivers in-app notifications only, which need no preferences.
   */
  notificationSettingsEnabled: boolean;
  /**
   * Whether billing exists in this deploy at all — new sign-ups get a Paid plan option, admins see the Billing dashboard, and Checkout/the Customer Portal are reachable. A pure reflection of the deploy-level PAYMENT_FEATURE_ENABLED env var (env.config.ts\'s own doc comment explains why there is deliberately no second, runtime-toggleable copy of this) — not stored on `platform_settings` and not writable through this API.
   */
  paymentFeatureEnabled: boolean;
  /**
   * Days between a business being scheduled for erasure and its data actually being erased — the deploy-level ERASURE_GRACE_PERIOD_DAYS env var, not stored on `platform_settings` and not writable through this API. The web app shows deadlines (\"takes effect on …\") computed from it, so they match the nightly purge.
   */
  erasureGracePeriodDays: number;
  /**
   * Whether the admin sign-in page offers \"Continue with Microsoft\": the Microsoft client is configured and `ADMIN_MICROSOFT_TENANT_ID` pins the directory admins sign in from. A pure reflection of the deploy environment, not stored on `platform_settings` and not writable through this API; independent of `microsoftLoginEnabled`, which governs tenant sign-in only.
   */
  adminMicrosoftLoginAvailable: boolean;
  /**
   * Whether the admin sign-in page offers \"Continue with Google\": the Google OAuth client is configured on this deploy. Independent of `googleLoginEnabled`, which governs tenant sign-in only (an admin who accepted an invite with Google has no password, so the switch must not take their way in away); a pure reflection of the environment, not writable.
   */
  adminGoogleLoginAvailable: boolean;
  /**
   * Whether this server has an email service it can deliver through. Email/password needs it (a sign-up is completed by an emailed code), so while it is false the stored password switch is not in effect and the admin cannot turn it on. Requires `EMAIL_DELIVERY_ENABLED=true` as well as a configured provider.
   */
  emailDeliveryAvailable: boolean;
}
