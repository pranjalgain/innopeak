import type { MessageCatalog } from './message-catalog.type';

export const messagesEn: MessageCatalog = {
  AUTH: {
    SIGNUP_OTP_SENT: (email: string): string => `Verification code sent to ${email}`,
    LOGIN_OTP_SENT: (email: string): string => `Verification code sent to ${email}`,
    // Same message whether or not the email matches a pending_verification account (no enumeration).
    RESEND_OTP_ACK: 'If this account is awaiting verification, a code has been sent.',
    EMAIL_VERIFIED: 'Email verified.',
    EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
    SSO_SIGNUP_DISABLED:
      'Signing up with this provider is turned off for this platform. Use another sign-in method.',
    PASSWORD_SIGNUP_DISABLED:
      'Signing up with an email and password is turned off for this platform. Use another sign-in method.',
    // Same message whether the code never existed, was used, or expired (no enumeration).
    INVALID_OR_EXPIRED_OTP: 'Invalid or expired verification code.',
    // The counter is keyed on the submitted address either way, so this doesn't reveal whether an account matches.
    TOO_MANY_OTP_ATTEMPTS:
      'Too many verification attempts. Request a new code and try again shortly.',
    // Same message for wrong password, unknown email, and SSO-only account (no enumeration).
    INVALID_CREDENTIALS: 'Invalid email or password.',
    ACCOUNT_DISABLED: 'This account has been disabled.',
    TENANT_SUSPENDED: 'This account is currently suspended.',
    INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token.',
    INVALID_ACCESS_TOKEN: 'Invalid or expired access token.',
    LOGGED_OUT: 'Logged out.',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect.',
    NEW_PASSWORD_SAME_AS_CURRENT: 'Choose a password different from your current one.',
    NO_PASSWORD_SET:
      'This account has no password. Sign in with the identity provider used to create it.',
    PASSWORD_ALREADY_SET: 'This account already has a password. Use change password instead.',
    // "Being signed out": the refresh tokens end in the database at once and older access tokens at their next request (a Redis mark), a beat apart.
    PASSWORD_CHANGED: 'Password changed. Other sessions are being signed out.',
    PASSWORD_SET: 'Password set. You can now sign in with a password too.',
    // Like RESEND_OTP_ACK: hides whether a code was re-sent or the previous one is still live in its cooldown.
    SET_PASSWORD_OTP_ACK: 'Verification code sent. Check your email to continue.',
    BUSINESS_NAME_MISMATCH: "The business name you typed doesn't match.",
    PASSWORD_REQUIRED_TO_DELETE: 'Confirm with your password instead of a code.',
    DELETE_ACCOUNT_OTP_ACK: 'Confirmation code sent. Check your email to continue.',
    ACCOUNT_DELETION_NOT_POSSIBLE: "This business can't be scheduled for deletion right now.",
    ACCOUNT_DELETION_SCHEDULED: "Deletion scheduled. You've been signed out.",
    ACCOUNT_SCHEDULED_FOR_DELETION: (date: string): string =>
      `This business is scheduled for deletion on ${date}. You can restore it until then.`,
    ACCOUNT_RESTORED: 'Your business has been restored. You can sign in now.',
    LOCALE_UPDATED: 'Language preference updated.',
    AVATAR_UPDATED: 'Avatar updated.',
    TENANT_ONLY: 'This action is only available to tenant users.',
    // A platform-admin token reached a tenant route; deliberately doesn't name the token type.
    GOOGLE_NOT_CONFIGURED:
      'Google sign-in is not configured on this server. Contact support or use email and password.',
    SSO_PENDING_SIGNUP_EXPIRED: 'This signup has expired. Start again from the sign-up page.',
    TENANT_CONTEXT_REQUIRED: 'This endpoint is not available for this account type.',
    // Same message whether the token never existed, was used, or expired (no enumeration).
    INVALID_OR_EXPIRED_INVITE: 'This invite link is invalid or has expired.',
    INVITE_ACCEPTED: "Invite accepted. You're signed in.",
    FAILED_TO_CREATE_TENANT: 'Failed to create tenant',
    FAILED_TO_CREATE_USER: 'Failed to create user',
    FAILED_TO_CREATE_INVITED_MEMBER: 'Failed to create invited member',
  },
  MEDIA: {
    UPLOAD_NOT_VERIFIED: 'Could not verify the uploaded image.',
    UNSUPPORTED_FORMAT:
      'This image format is not supported. Please upload a JPG, PNG, WEBP, GIF, AVIF, HEIC, or BMP file.',
    FILE_TOO_LARGE: 'That image is too large. Please upload a file under 10 MB.',
    FAILED_TO_PERSIST_AVATAR: 'Failed to persist avatar',
    STORAGE_NOT_CONFIGURED: 'Image uploads are not available right now. Please try again later.',
  },
  NOTIFICATIONS: {
    LISTED: 'Notifications retrieved successfully',
    // Same message whether missing or another user's: "forbidden" would confirm the id exists.
    NOT_FOUND: 'Notification not found.',
    MARKED_READ: 'Notification marked as read',
    MARKED_ALL_READ: 'All notifications marked as read',
    FEED: {
      REVIEW_ESCALATED_TITLE: 'Review escalated',
      REVIEW_ESCALATED_DESCRIPTION: (rating: number): string =>
        `A ${rating}-star review needs your attention before anyone replies.`,
      REVIEW_ESCALATED_SUMMARY_TITLE: (count: number): string =>
        `${count} more ${count === 1 ? 'review' : 'reviews'} escalated`,
      REVIEW_ESCALATED_SUMMARY_DESCRIPTION: 'Open the review queue to see all escalated reviews.',
      REPLY_NEEDS_APPROVAL_TITLE: 'Reply ready for approval',
      REPLY_NEEDS_APPROVAL_DESCRIPTION: (rating: number): string =>
        `A drafted reply to a ${rating}-star review is waiting for your approval.`,
      REPLY_NEEDS_APPROVAL_SUMMARY_TITLE: (count: number): string =>
        `${count} more ${count === 1 ? 'reply is' : 'replies are'} ready for approval`,
      REPLY_NEEDS_APPROVAL_SUMMARY_DESCRIPTION: 'Open the review queue to approve them.',
      REPLY_APPROVED_TITLE: 'Reply approved',
      REPLY_APPROVED_DESCRIPTION: (rating: number): string =>
        `The reply to a ${rating}-star review was approved and is being posted.`,
      REPLY_APPROVED_SUMMARY_TITLE: (count: number): string =>
        `${count} more ${count === 1 ? 'reply' : 'replies'} approved`,
      REPLY_APPROVED_SUMMARY_DESCRIPTION: 'Open the review queue to see what was posted.',
      CONNECTION_ISSUE_TITLE: 'Google connection needs attention',
      CONNECTION_ISSUE_DESCRIPTION:
        'Reconnect your Google Business Profile so new reviews keep syncing and replies can be posted.',
    },
  },
  CONNECTIONS: {
    CONNECTION_NOT_FOUND: 'No Google Business Profile connection found for this account.',
    // Same message and 404 whether it belongs to no one or another tenant: "forbidden" would confirm the id exists.
    LOCATION_NOT_FOUND: 'Location not found.',
    EXTERNAL_LOCATION_NOT_FOUND:
      'That location is not visible to the connected Google account. Reconnect and try again.',
    CONNECTION_NEEDS_REAUTH:
      'The Google connection has expired. Reconnect your Google Business Profile to continue.',
    LOCATION_LIMIT_REACHED: "You've reached your plan's location limit. Upgrade to add more.",
    BACKFILL_ENQUEUE_FAILED:
      'Location connected, but the review import could not be started. Please try confirming this location again.',
    PROVIDER_UNAVAILABLE: 'Google Business Profile is unavailable right now. Please try again.',
    PROVIDER_NOT_CONFIGURED:
      'Google Business Profile is not configured on this server. Contact support.',
    ACCOUNT_CHOICE_EXPIRED:
      'Your account selection expired. Connect your Google Business Profile again.',
    ACCOUNT_NOT_IN_CHOICE:
      'That account is not one of the accounts Google offered. Choose from the list.',
    ACCOUNT_MISMATCH:
      'Your business is already connected to a different Google Business Profile account. Disconnect it first, or choose the same account.',
    DISCONNECTED: 'Google Business Profile disconnected.',
    LOCATION_CONFIRMED: 'Location connected. Importing your review history.',
    LOCATION_INACTIVE: 'This location is disconnected and cannot be selected.',
    LOCATION_BILLING_PAUSED:
      'This location is paused on your current plan and cannot be selected. Choose an active location or upgrade your plan.',
    ACTIVE_LOCATION_UPDATED: 'Active location updated.',
    FAILED_TO_UPSERT_CONNECTION: 'Failed to upsert review provider connection',
    FAILED_TO_UPSERT_LOCATION: 'Failed to upsert location',
  },
  DASHBOARD: {
    TENANT_ONLY: 'Dashboard analytics are only available to tenant users.',
  },
  REVIEWS: {
    REVIEW_NOT_FOUND: 'Review not found.',
    TENANT_ONLY: 'Reviews are only available to tenant users.',
    FAILED_TO_ACQUIRE_SYNC_RUN: 'Failed to acquire sync run',
    SYNC_WAITING_FOR_RATE_LIMIT: (seconds, attempt, maxAttempts) =>
      `Google is rate limiting requests; waiting ${seconds}s before retrying (attempt ${attempt} of ${maxAttempts}).`,
    SYNC_FAILED_AUTH:
      'Google no longer accepts the connection. Reconnect your Google Business Profile.',
    SYNC_FAILED_RATE_LIMITED:
      'Google is limiting requests right now. The sync will try again shortly.',
    SYNC_FAILED_UNAVAILABLE: 'Google could not be reached. The sync will try again shortly.',
    SYNC_FAILED_CLASSIFICATION:
      'New reviews were imported, but sorting them failed. It will be retried on the next sync.',
    SYNC_FAILED_UNKNOWN:
      'The sync did not finish because of an unexpected problem. It will be retried.',
    FAILED_TO_UPSERT_REVIEW: 'Failed to upsert review',
    GENERATED_RESPONSE_INSERT_FAILED: (reviewId: string): string =>
      `Failed to record the generated reply for review ${reviewId}`,
    RESPONSE_NOT_FOUND: 'Reply draft not found.',
    RESPONSE_NOT_ACTIONABLE: 'This reply has already been decided and cannot be changed.',
    RESPONSE_ALREADY_LIVE: 'This review already has an approved or posted reply.',
    RESPONSE_APPROVED: 'Reply approved successfully',
    RESPONSE_REJECTED: 'Reply rejected successfully',
    RESPONSE_NOT_RETRYABLE: 'Only a reply that failed to post can be retried.',
    RESPONSE_NOT_POSTABLE: 'Only an approved reply that has not yet posted can be posted.',
    REVIEW_ALREADY_HAS_LIVE_REPLY: 'This review already has an approved or posted reply.',
    REVIEW_ALREADY_DISMISSED: 'This review has been dismissed and cannot be replied to.',
    REVIEW_REMOVED_UPSTREAM: 'This review was removed on Google and cannot be replied to.',
    REVIEW_LOCATION_PAUSED:
      'This business location is paused or disconnected, so replies cannot be approved or posted for it. Reactivate it first.',
    POST_QUEUE_UNAVAILABLE: 'Could not queue the reply for posting right now. Please try again.',
    POST_FAILED_REVIEW_REMOVED:
      'This review was removed on Google, so the reply could not be posted.',
    POST_FAILED_RECONNECT:
      'Google no longer accepts the connection, so the reply could not be posted. Reconnect your Google Business Profile in Settings, then retry.',
    POST_FAILED_REJECTED: 'Google did not accept this reply. Edit the text and try again.',
    POST_FAILED_UNAVAILABLE:
      'Google is not responding right now, so the reply could not be posted. Please retry in a few minutes.',
    POST_FAILED_UNKNOWN:
      'The reply could not be posted. Please retry; if it keeps failing, contact support.',
    POST_FAILED_LOCATION_PAUSED:
      'This business location is paused or disconnected, so the reply was not posted. Reactivate the location and retry.',
    POST_FAILED_LOCATION_UNAVAILABLE:
      'Google could not find this business location, so the reply could not be posted. Check that it is still part of the connected Google account.',
    MANUAL_REPLY_INSERT_FAILED: (reviewId: string): string =>
      `Failed to record the manual reply for review ${reviewId}`,
    MANUAL_REPLY_CREATED: 'Reply created successfully',
    RESPONSE_POST_QUEUED: 'Reply queued to post to Google',
    RESPONSE_RETRY_QUEUED: 'Reply queued to retry posting to Google',
    POST_STATUS_RETRIEVED: 'Post status retrieved successfully',
  },
  PROMPTS: {
    LISTED: 'Prompts retrieved successfully',
    VERSION_CREATED: 'Prompt version created successfully',
    TONE_UPDATED: 'Prompt tone updated successfully',
    NOT_FOUND: 'Prompt not found',
    TEMPLATE_UNCHANGED: 'Template is identical to the current version',
    VERSION_CONFLICT: 'Another version was saved at the same time — retry after reloading',
    UNKNOWN_VARIABLE: (names: readonly string[]): string =>
      `Unknown prompt placeholder(s): ${names.join(', ')}`,
    MISSING_VARIABLE: (names: readonly string[]): string =>
      `Missing required prompt placeholder(s): ${names.join(', ')}`,
    TENANT_ONLY: 'Prompts are only available to tenant users.',
    STATS_RETRIEVED: 'Prompt version stats retrieved successfully',
    VERSION_NOT_FOUND: 'Prompt version not found',
    STATS_BATCH_RETRIEVED: 'Prompt version stats retrieved successfully',
  },
  AI: {
    PROMPT_NOT_CONFIGURED: 'No prompt is configured for this category yet.',
    PROVIDER_NOT_CONFIGURED:
      'The AI provider is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL.',
    AZURE_PROVIDER_NOT_CONFIGURED:
      'The Azure OpenAI provider is not configured. Set AZURE_OPENAI_ENDPOINT, ' +
      'AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT, and AZURE_OPENAI_API_VERSION.',
    AZURE_REGION_INVALID:
      'AZURE_OPENAI_REGION must be "westeurope" or "northeurope" — the EU regions approved for this deployment (GDPR).',
    GENERATION_FAILED: 'Failed to generate an AI reply. Please try again.',
  },
  BILLING: {
    PLANS_RETRIEVED: 'Billing plans retrieved successfully',
    SUBSCRIPTION_RETRIEVED: 'Subscription retrieved successfully',
    CHECKOUT_SESSION_CREATED: 'Checkout session created',
    PORTAL_SESSION_CREATED: 'Billing portal session created',
    ACTIVE_LOCATION_UPDATED: 'Active location updated',
    TENANT_ONLY: 'Billing is only available to tenant users.',
    NOT_ENABLED: 'Billing is not currently available for new upgrades.',
    PLAN_NOT_FOUND: 'Billing plan not found',
    SUBSCRIPTION_NOT_FOUND: 'Subscription not found',
    ALREADY_SUBSCRIBED: "You're already on the Paid plan.",
    LOCATION_LIMIT_REACHED: "You've reached your plan's location limit. Upgrade to add more.",
    TEAM_MEMBER_LIMIT_REACHED:
      "You've reached your plan's team member limit. Upgrade to invite more.",
    CUSTOM_PROMPTS_NOT_ON_PLAN: 'Custom prompt templates are not available on your current plan.',
    STRIPE_WEBHOOK_SIGNATURE_INVALID: 'Invalid Stripe webhook signature',
    LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION:
      'This location cannot be made active — it may not belong to your business or is disconnected.',
    SUBSCRIPTION_CANCELED: 'Subscription set to cancel at the end of the current billing period',
    FAILED_TO_CREATE_SUBSCRIPTION: 'Failed to create tenant subscription',
    FREE_PLAN_NOT_SEEDED: 'Free billing plan is not seeded',
    PAID_PLAN_NOT_SEEDED: 'Paid billing plan is not seeded',
    RECEIPTS_RETRIEVED: 'Receipts retrieved successfully',
    RECEIPT_NOT_FOUND: 'Receipt not found',
    BILLING_PROFILE_RETRIEVED: 'Billing profile retrieved successfully',
    BILLING_PROFILE_UPDATED: 'Billing profile updated',
    SETUP_INTENT_CREATED: 'Card setup started',
    PAYMENT_METHOD_UPDATED: 'Payment method updated',
    PAYMENT_NOT_CONFIGURED: 'Payments are not available right now. Please try again later.',
    PAYMENT_PROVIDER_UNAVAILABLE:
      'Our payment provider is not responding right now. Please try again in a moment.',
    STRIPE_WEBHOOK_TENANT_NOT_FOUND: 'No matching tenant for this Stripe event',
    CHECKOUT_SESSION_TENANT_MISMATCH: 'Checkout session not found',
    PAYMENT_METHOD_NOT_USABLE:
      "That payment method can't be used for this account. Add the card again.",
    CHECKOUT_RECONCILED: 'Billing status refreshed',
  },
  SETTINGS: {
    BLOCKLIST_LISTED: 'Blocklist terms retrieved successfully',
    BLOCKLIST_TERM_CREATED: 'Blocklist term added',
    BLOCKLIST_TERM_REMOVED: 'Blocklist term removed',
    BLOCKLIST_TERM_EXISTS: 'This term is already on the blocklist',
    BLOCKLIST_LIMIT_REACHED:
      "You've reached the limit of 100 blocklist terms. Remove one to add another.",
    BLOCKLIST_TERM_NOT_FOUND: 'Blocklist term not found',
    TENANT_ONLY: 'Settings are only available to tenant users.',
    REMOVED_TEAM_MEMBER: 'Removed team member',
    RETRIEVED: 'Settings retrieved successfully',
    UPDATED: 'Settings updated',
    TENANT_SETTINGS_MISSING: 'Tenant settings were not provisioned for this account',
    TENANT_SETTINGS_ROW_MISSING: (tenantId: string): string =>
      `No tenant settings row found for tenant ${tenantId}`,
    PLATFORM_CONFIG_MISSING: 'Platform settings are not configured.',
    MEMBER_INVITE_SENT: 'Invite sent.',
    MEMBER_INVITE_REVOKED: 'Invite revoked.',
    MEMBER_EMAIL_ALREADY_INVITED: 'This email already has a pending invite.',
    MEMBER_NOT_FOUND: 'Team member not found.',
    MEMBER_INVITE_NOT_REVOCABLE: 'This invite has already been accepted or is no longer pending.',
    MEMBER_INVITES_DISABLED: 'Inviting team members is turned off for this platform.',
    NOTIFICATION_SETTINGS_DISABLED: 'Notification settings are not available on this platform.',
    MEMBER_REMOVAL_REQUESTED: (days: number): string =>
      `Removal requested. This member loses access now, and their data is permanently erased in ${days} ${days === 1 ? 'day' : 'days'} unless you cancel first.`,
    MEMBER_REMOVAL_CANCELLED: 'Removal cancelled — this member keeps their access.',
    MEMBER_REMOVAL_NOT_PENDING: 'This member has no pending removal to cancel.',
    CANNOT_REMOVE_LAST_OWNER: 'At least one owner must remain on this account.',
    CANNOT_REMOVE_SELF: 'You cannot remove your own account this way.',
    NOTIFICATION_RECIPIENTS_LISTED: 'Notification recipients retrieved successfully',
    NOTIFICATION_RECIPIENT_UPDATED: 'Notification recipient updated',
    NOTIFICATION_RECIPIENT_NOT_FOUND: 'Notification recipient not found',
    NOTIFICATION_RECIPIENT_NO_FIELDS: 'Provide a channel or active status to update.',
  },
  ADMIN: {
    ADMIN_ONLY: 'Only a platform admin may perform this action.',
    USER_NOT_FOUND: 'User not found.',
    USER_STATUS_UPDATED: 'User status updated.',
    BUSINESS_NOT_FOUND: 'Business not found.',
    POST_ERASURE_CHARGE_NOT_FOUND: 'That charge was not found, or has already been handled.',
    POST_ERASURE_CHARGE_RESOLVED: 'Marked as handled.',
    BUSINESS_STATUS_UPDATED: 'Business status updated.',
    BUSINESS_ERASURE_REQUESTED: (days: number): string =>
      `Erasure requested. Every user in this business loses access now, and their data is permanently erased in ${days} ${days === 1 ? 'day' : 'days'} unless you cancel first.`,
    BUSINESS_ERASURE_CANCELLED: 'Erasure cancelled — this business is restored to active.',
    BUSINESS_ERASURE_PENDING:
      'This business has a pending erasure request. Cancel it before changing status directly.',
    BUSINESS_ERASURE_NOT_PENDING: 'This business has no pending erasure request to cancel.',
    USER_REMOVAL_PENDING:
      'This user has a pending removal request. Cancel it before changing their status directly.',
    USER_INVITE_PENDING:
      'This user has not accepted their invite yet, so there is nothing to deactivate. Revoke the invite instead.',
    AVATAR_UPDATED: 'Avatar updated.',
    PASSWORD_CHANGED: 'Password changed.',
    INVITE_SENT: 'Invite sent.',
    INVITE_REVOKED: 'Invite revoked.',
    INVITE_NOT_FOUND: 'Invite not found.',
    INVITE_NOT_REVOCABLE: 'This invite has already been accepted or is no longer pending.',
    EMAIL_ALREADY_INVITED: 'This email is already a platform admin or has a pending invite.',
    PLATFORM_SETTINGS_UPDATED: 'Platform settings updated.',
    PLATFORM_SETTINGS_NO_METHOD_ENABLED:
      'At least one sign-in method (Microsoft, email/password, or Google) must stay enabled.',
    NOTIFICATION_CHANNELS_NOT_IMPLEMENTED:
      'Email and Teams notifications are not implemented yet, so notification settings cannot be turned on.',
    CANNOT_DISABLE_SSO_LOGIN_SSO_ONLY_USERS: (provider: string, count: number): string => {
      const who = count === 1 ? 'one user' : `${count} users`;
      return `${provider} is the only way ${who} can sign in. Turning it off locks them out until it is turned back on. Confirm to turn it off anyway.`;
    },
    PLATFORM_SETTINGS_NO_USABLE_METHOD:
      'At least one enabled sign-in method must also be set up on this server (Microsoft and Google need their credentials configured).',
    ADMIN_NOT_FOUND: 'Platform admin not found.',
    CANNOT_DISABLE_SELF: 'You cannot disable your own admin account.',
    CANNOT_DISABLE_LAST_ADMIN: 'At least one platform admin must stay active.',
    CANNOT_DISABLE_ROOT_ADMIN: 'The founding platform admin cannot be disabled.',
    CANNOT_DISABLE_INVITED:
      'This admin has not accepted their invite yet — revoke the invite instead.',
    ADMIN_DISABLED: 'Admin disabled.',
    ADMIN_ENABLED: 'Admin enabled.',
    FAILED_TO_CREATE_INVITED_PLATFORM_ADMIN: 'Failed to create invited platform admin',
  },
  VALIDATION: {
    EMAIL_INVALID: 'Enter a valid email address.',
    PASSWORD_REQUIRED: 'Enter your password.',
    PASSWORD_LENGTH: 'Password must be between 8 and 128 characters.',
    PASSWORD_COMPLEXITY:
      'Password must contain an uppercase letter, a lowercase letter, a digit, and a special character.',
    OTP_REQUIRED: 'Enter the verification code.',
    OTP_FORMAT: 'The verification code must be exactly 6 digits.',
    FULL_NAME_REQUIRED: 'Enter your full name.',
    FULL_NAME_LENGTH: 'Your name must be between 1 and 255 characters.',
    BUSINESS_NAME_REQUIRED: 'Enter your business name.',
    BUSINESS_NAME_LENGTH: 'Business name must be between 1 and 255 characters.',
    BUSINESS_NAME_CONFIRM: 'Type the business name to confirm.',
    NAME_REQUIRED: 'Name is required.',
    PAYMENT_METHOD_REQUIRED: 'A payment method id is required.',
    PAYMENT_METHOD_INVALID: 'Enter a valid payment method id.',
    REPLY_NEEDS_TEXT: 'The reply must contain some text.',
  },
  COMMON: {
    SUCCESS: 'Success',
    REQUEST_SUCCESSFUL: 'Request successful',
    INTERNAL_ERROR: 'Something went wrong. Please try again later.',
    EMAIL_QUEUE_UNAVAILABLE:
      'We could not send the email right now. Nothing was changed; please try again in a moment.',
    DB_UNIQUE_VIOLATION: 'Unique constraint violation',
    DB_FOREIGN_KEY_VIOLATION: 'Foreign key constraint failed',
    DB_NOT_NULL_VIOLATION: 'Not null constraint violation',
    DB_CHECK_VIOLATION: 'Check constraint violation',
    DB_EXCLUSION_VIOLATION: 'Exclusion constraint violation',
    DB_VALUE_TOO_LONG: 'Value too long for column type',
    DB_NUMERIC_OUT_OF_RANGE: 'Numeric value out of range',
    DB_INVALID_DATETIME: 'Invalid datetime format',
    DB_INVALID_TEXT: 'Invalid text representation',
    DB_INVALID_CHARACTER_SEQUENCE: 'Invalid character sequence',
    DB_TABLE_NOT_FOUND: 'Table or view not found',
    DB_COLUMN_NOT_FOUND: 'Column not found',
    DB_SYNTAX_ERROR: 'Syntax error in query',
    DB_SERIALIZATION_FAILURE: 'Serialization failure — retry the transaction',
    DB_DEADLOCK: 'Deadlock detected — retry the transaction',
    DB_CONNECTION_FAILURE: 'Database connection failure',
    DB_CONNECTION_UNAVAILABLE: 'Unable to establish database connection',
    DB_QUERY_TIMEOUT: 'Query timeout — statement cancelled',
    SMS_TRIAL_RESTRICTED:
      'SMS service is restricted for trial accounts. Please verify the recipient number or upgrade your Twilio account.',
    UNKNOWN_ERROR: 'An unknown error occurred. Please try again later.',
  },
};
