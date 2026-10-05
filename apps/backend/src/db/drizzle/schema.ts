import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const billingPlanCode = pgEnum('billing_plan_code', ['free', 'paid']);
export const platformActivityType = pgEnum('platform_activity_type', [
  'business_suspended',
  'business_reactivated',
  'admin_invite_sent',
  'admin_invite_revoked',
  'user_activated',
  'user_deactivated',
  'admin_disabled',
  'admin_enabled',
  'business_erasure_requested',
  'business_erasure_cancelled',
  'business_erased',
]);
export const escalationReason = pgEnum('escalation_reason', ['low_rating', 'blocklist_match']);
export const googleConnectionStatus = pgEnum('google_connection_status', [
  'active',
  'needs_reauth',
]);
export const locationStatus = pgEnum('location_status', ['active', 'inactive']);
export const mediaKind = pgEnum('media_kind', ['avatar']);
export const notificationChannel = pgEnum('notification_channel', ['email', 'teams']);
export const notificationChannelPref = pgEnum('notification_channel_pref', [
  'email',
  'teams',
  'both',
]);
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed']);
export const notificationType = pgEnum('notification_type', ['escalation']);
export const inAppNotificationType = pgEnum('in_app_notification_type', [
  'review_escalated',
  'reply_needs_approval',
  'reply_approved',
  'connection_issue',
]);
export const platformAdminInvitePurpose = pgEnum('platform_admin_invite_purpose', [
  'invite',
  'reset',
  'set_password',
]);
export const platformAdminStatus = pgEnum('platform_admin_status', [
  'invited',
  'active',
  'disabled',
]);
export const promptCategory = pgEnum('prompt_category', ['positive', 'neutral', 'escalated']);
export const promptTone = pgEnum('prompt_tone', [
  'friendly',
  'professional',
  'formal',
  'playful',
  'empathetic',
]);
export const responseSource = pgEnum('response_source', [
  'ai_generated',
  'human_edited',
  'human_manual',
  'imported',
]);
export const responseStatus = pgEnum('response_status', [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'posted',
  'post_failed',
  'superseded',
]);
export const responseType = pgEnum('response_type', [
  'auto_reply_suggestion',
  'escalation_snippet',
  'imported_reply',
]);
export const reviewClassification = pgEnum('review_classification', [
  'auto_reply_candidate',
  'escalated',
  'pending_classification',
]);
export const reviewProvider = pgEnum('review_provider', ['google']);
export const reviewSentiment = pgEnum('review_sentiment', ['positive', 'neutral', 'negative']);
export const reviewStatus = pgEnum('review_status', ['new', 'in_review', 'responded', 'dismissed']);
export const subscriptionStatus = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'incomplete',
]);
export const syncHealthStatus = pgEnum('sync_health_status', ['ok', 'error']);
export const syncRunStatus = pgEnum('sync_run_status', ['running', 'ok', 'error']);
export const syncTrigger = pgEnum('sync_trigger', ['scheduled', 'backfill']);
export const tenantIdentityProvider = pgEnum('tenant_identity_provider', [
  'entra_id',
  'google_workspace',
]);
export const tenantStatus = pgEnum('tenant_status', [
  'pending_activation',
  'active',
  'suspended',
  'erased',
]);
export const tokenPurpose = pgEnum('token_purpose', [
  'verify_email',
  'invite',
  'reset',
  'set_password',
]);
export const userIdentityProvider = pgEnum('user_identity_provider', ['entra_id', 'google']);
export const userLocale = pgEnum('user_locale', ['en', 'de']);
export const userRole = pgEnum('user_role', ['owner', 'member']);
export const userStatus = pgEnum('user_status', [
  'pending_verification',
  'invited',
  'active',
  'disabled',
]);

export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    email: varchar({ length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    invitedByPlatformAdminId: uuid('invited_by_platform_admin_id'),
    status: platformAdminStatus().notNull(),
    locale: userLocale(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_platform_admins_email').using(
      'btree',
      table.email.asc().nullsLast().op('text_ops')
    ),
    index('idx_platform_admins_invited_by_platform_admin_id').using(
      'btree',
      table.invitedByPlatformAdminId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_platform_admins_single_root')
      .using('btree', sql`(true)`)
      .where(sql`(invited_by_platform_admin_id IS NULL)`),
    foreignKey({
      columns: [table.invitedByPlatformAdminId],
      foreignColumns: [table.id],
      name: 'platform_admins_invited_by_platform_admin_id_fkey',
    }).onDelete('set null'),
  ]
);

export const platformAdminIdentities = pgTable(
  'platform_admin_identities',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    platformAdminId: uuid('platform_admin_id').notNull(),
    provider: userIdentityProvider().notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_platform_admin_identities_platform_admin_id').using(
      'btree',
      table.platformAdminId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_platform_admin_identities_provider_provider_user_id').using(
      'btree',
      table.provider.asc().nullsLast().op('text_ops'),
      table.providerUserId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.platformAdminId],
      foreignColumns: [platformAdmins.id],
      name: 'platform_admin_identities_platform_admin_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const platformAdminInvites = pgTable(
  'platform_admin_invites',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    platformAdminId: uuid('platform_admin_id').notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    purpose: platformAdminInvitePurpose().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_platform_admin_invites_platform_admin_id').using(
      'btree',
      table.platformAdminId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_platform_admin_invites_token_hash').using(
      'btree',
      table.tokenHash.asc().nullsLast().op('text_ops')
    ),
    uniqueIndex('idx_platform_admin_invites_platform_admin_id_purpose').using(
      'btree',
      table.platformAdminId.asc().nullsLast().op('uuid_ops'),
      table.purpose.asc().nullsLast().op('enum_ops')
    ),
    foreignKey({
      columns: [table.platformAdminId],
      foreignColumns: [platformAdmins.id],
      name: 'platform_admin_invites_platform_admin_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const tenants = pgTable(
  'tenants',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    name: varchar({ length: 255 }).notNull(),
    createdByPlatformAdminId: uuid('created_by_platform_admin_id'),
    status: tenantStatus().default('pending_activation').notNull(),
    erasureRequestedAt: timestamp('erasure_requested_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    // A single shared value for the whole tenant — every member sees the same currently-selected
    // business; only an owner may change it (enforced at the API layer, not here). `ON DELETE SET
    // NULL`, not NOT NULL — removing/deactivating the currently-selected location must not fail,
    // and NULL reads correctly as "no selection yet."
    //
    // Column-level `.references()` (a lazy thunk), not a `foreignKey()` entry in the array below
    // — `tenants` -> `locations` (via this column) -> `tenants` (via `locations.tenant_id`) is a
    // genuine 2-table reference cycle, and `foreignKey()`'s array lives inside the same
    // object-literal TypeScript structurally infers `tenants`'s own type from, so a forward
    // reference to `locations` there makes that inference circular ('tenants' implicitly has type
    // 'any' because it is referenced in its own initializer). The lazy callback here sidesteps
    // that: the column's own type doesn't depend on resolving `tenants`'s full table type first.
    activeLocationId: uuid('active_location_id').references((): AnyPgColumn => locations.id, {
      onDelete: 'set null',
    }),
  },
  table => [
    index('idx_tenants_created_by_platform_admin_id').using(
      'btree',
      table.createdByPlatformAdminId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_tenants_status').using('btree', table.status.asc().nullsLast().op('enum_ops')),
    index('idx_tenants_erasure_requested_at')
      .using('btree', table.erasureRequestedAt.asc().nullsLast().op('timestamptz_ops'))
      .where(sql`(erasure_requested_at IS NOT NULL)`),
    foreignKey({
      columns: [table.createdByPlatformAdminId],
      foreignColumns: [platformAdmins.id],
      name: 'tenants_created_by_platform_admin_id_fkey',
    }).onDelete('set null'),
  ]
);

export const tenantIdentityProviders = pgTable(
  'tenant_identity_providers',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    provider: tenantIdentityProvider().notNull(),
    providerTenantId: varchar('provider_tenant_id', { length: 255 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_tenant_identity_providers_provider_tenant_id').using(
      'btree',
      table.provider.asc().nullsLast().op('text_ops'),
      table.providerTenantId.asc().nullsLast().op('text_ops')
    ),
    index('idx_tenant_identity_providers_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'tenant_identity_providers_tenant_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const users = pgTable(
  'users',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    // Nullable, not NOT NULL — GDPR anonymize-in-place nulls this rather than deleting the row,
    // so review_responses.approved_by_user_id/created_by_user_id keep a valid FK target.
    name: varchar({ length: 255 }),
    email: varchar({ length: 255 }),
    passwordHash: varchar('password_hash', { length: 255 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'string' }),
    invitedByUserId: uuid('invited_by_user_id'),
    role: userRole().notNull(),
    status: userStatus().notNull(),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true, mode: 'string' }),
    erasureRequestedAt: timestamp('erasure_requested_at', { withTimezone: true, mode: 'string' }),
    locale: userLocale(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_users_email_active')
      .using('btree', table.email.asc().nullsLast().op('text_ops'))
      .where(sql`(anonymized_at IS NULL)`),
    index('idx_users_invited_by_user_id').using(
      'btree',
      table.invitedByUserId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_users_role').using('btree', table.role.asc().nullsLast().op('enum_ops')),
    index('idx_users_status').using('btree', table.status.asc().nullsLast().op('enum_ops')),
    index('idx_users_erasure_requested_at')
      .using('btree', table.erasureRequestedAt.asc().nullsLast().op('timestamptz_ops'))
      .where(sql`(erasure_requested_at IS NOT NULL)`),
    index('idx_users_tenant_id').using('btree', table.tenantId.asc().nullsLast().op('uuid_ops')),
    uniqueIndex('idx_users_tenant_id_email').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.email.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'users_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.invitedByUserId],
      foreignColumns: [table.id],
      name: 'users_invited_by_user_id_fkey',
    }).onDelete('set null'),
  ]
);

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    escalationRatingThreshold: integer('escalation_rating_threshold').default(3).notNull(),
    autoPostEnabled: boolean('auto_post_enabled').default(false).notNull(),
    reviewDataRetentionMonths: integer('review_data_retention_months'),
    aiReplyCount: smallint('ai_reply_count').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_tenant_settings_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'tenant_settings_tenant_id_fkey',
    }).onDelete('cascade'),
    check(
      'tenant_settings_escalation_rating_threshold_check',
      sql`(escalation_rating_threshold >= 1) AND (escalation_rating_threshold <= 5)`
    ),
    check(
      'tenant_settings_ai_reply_count_check',
      sql`(ai_reply_count >= 1) AND (ai_reply_count <= 3)`
    ),
  ]
);

export const blocklistTerms = pgTable(
  'blocklist_terms',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    term: varchar({ length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_blocklist_terms_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_blocklist_terms_tenant_id_lower_term').using(
      'btree',
      sql`tenant_id`,
      sql`lower((term)::text)`
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'blocklist_terms_tenant_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    userId: uuid('user_id').notNull(),
    provider: userIdentityProvider().notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    email: varchar({ length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_user_identities_provider_provider_user_id').using(
      'btree',
      table.provider.asc().nullsLast().op('text_ops'),
      table.providerUserId.asc().nullsLast().op('text_ops')
    ),
    index('idx_user_identities_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_identities_user_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    userId: uuid('user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    purpose: tokenPurpose().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_password_reset_tokens_token_hash').using(
      'btree',
      table.tokenHash.asc().nullsLast().op('text_ops')
    ),
    index('idx_password_reset_tokens_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_password_reset_tokens_user_id_purpose').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.purpose.asc().nullsLast().op('enum_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'password_reset_tokens_user_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const reviewProviderConnections = pgTable(
  'review_provider_connections',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    connectedByUserId: uuid('connected_by_user_id').notNull(),
    provider: reviewProvider().default('google').notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    credentialReference: varchar('credential_reference', { length: 255 }).notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true, mode: 'string' }),
    status: googleConnectionStatus().default('active').notNull(),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_review_provider_connections_connected_by_user_id').using(
      'btree',
      table.connectedByUserId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_review_provider_connections_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_review_provider_connections_tenant_provider_account').using(
      'btree',
      table.tenantId.asc().nullsLast().op('enum_ops'),
      table.provider.asc().nullsLast().op('uuid_ops'),
      table.providerAccountId.asc().nullsLast().op('enum_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'review_provider_connections_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.connectedByUserId],
      foreignColumns: [users.id],
      name: 'review_provider_connections_connected_by_user_id_fkey',
    }).onDelete('restrict'),
  ]
);

export const notificationRecipients = pgTable(
  'notification_recipients',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    notificationType: notificationType('notification_type').default('escalation').notNull(),
    channel: notificationChannelPref().default('email').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_notification_recipients_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_notification_recipients_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'notification_recipients_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'notification_recipients_user_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const locations = pgTable(
  'locations',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    providerConnectionId: uuid('provider_connection_id').notNull(),
    provider: reviewProvider().default('google').notNull(),
    externalLocationId: varchar('external_location_id', { length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    address: varchar({ length: 500 }),
    status: locationStatus().default('active').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'string' }),
    lastSyncStatus: syncHealthStatus('last_sync_status'),
    lastSyncError: text('last_sync_error'),
    onboardingBackfillCompletedAt: timestamp('onboarding_backfill_completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    lastReviewSyncedAt: timestamp('last_review_synced_at', { withTimezone: true, mode: 'string' }),
    billingPausedAt: timestamp('billing_paused_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_locations_billing_paused_at')
      .using('btree', table.billingPausedAt.asc().nullsLast().op('timestamptz_ops'))
      .where(sql`(billing_paused_at IS NOT NULL)`),
    uniqueIndex('idx_locations_provider_connection_external_location').using(
      'btree',
      table.providerConnectionId.asc().nullsLast().op('text_ops'),
      table.externalLocationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_locations_provider_connection_id').using(
      'btree',
      table.providerConnectionId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_locations_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'locations_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.providerConnectionId],
      foreignColumns: [reviewProviderConnections.id],
      name: 'locations_provider_connection_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const userLocations = pgTable(
  'user_locations',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    userId: uuid('user_id').notNull(),
    locationId: uuid('location_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_user_locations_location_id').using(
      'btree',
      table.locationId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_user_locations_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_user_locations_user_id_location_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.locationId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_locations_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [locations.id],
      name: 'user_locations_location_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    locationId: uuid('location_id').notNull(),
    externalReviewId: varchar('external_review_id', { length: 255 }).notNull(),
    externalReviewerId: varchar('external_reviewer_id', { length: 255 }),
    rating: integer().notNull(),
    reviewText: text('review_text'),
    reviewerName: varchar('reviewer_name', { length: 255 }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'string' }),
    externalUpdatedAt: timestamp('external_updated_at', { withTimezone: true, mode: 'string' }),
    sentiment: reviewSentiment(),
    classification: reviewClassification().default('pending_classification').notNull(),
    escalationReason: escalationReason('escalation_reason'),
    matchedKeywords: jsonb('matched_keywords'),
    status: reviewStatus().default('new').notNull(),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true, mode: 'string' }),
    removedUpstreamAt: timestamp('removed_upstream_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_reviews_classification').using(
      'btree',
      table.classification.asc().nullsLast().op('enum_ops')
    ),
    index('idx_reviews_external_reviewer_id').using(
      'btree',
      table.externalReviewerId.asc().nullsLast().op('text_ops')
    ),
    index('idx_reviews_location_id').using(
      'btree',
      table.locationId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_reviews_location_id_external_review_id').using(
      'btree',
      table.locationId.asc().nullsLast().op('text_ops'),
      table.externalReviewId.asc().nullsLast().op('text_ops')
    ),
    index('idx_reviews_reviewed_at').using(
      'btree',
      table.reviewedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    index('idx_reviews_status').using('btree', table.status.asc().nullsLast().op('enum_ops')),
    index('idx_reviews_tenant_id').using('btree', table.tenantId.asc().nullsLast().op('uuid_ops')),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'reviews_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [locations.id],
      name: 'reviews_location_id_fkey',
    }).onDelete('cascade'),
    check('reviews_rating_check', sql`(rating >= 1) AND (rating <= 5)`),
  ]
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    locationId: uuid('location_id').notNull(),
    trigger: syncTrigger().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    status: syncRunStatus().default('running').notNull(),
    reviewsFetched: integer('reviews_fetched'),
    reviewsTotal: integer('reviews_total'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_sync_runs_location_id').using(
      'btree',
      table.locationId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_sync_runs_location_id_running')
      .using('btree', table.locationId.asc().nullsLast().op('uuid_ops'))
      .where(sql`(status = 'running'::sync_run_status)`),
    index('idx_sync_runs_location_id_started_at').using(
      'btree',
      table.locationId.asc().nullsLast().op('uuid_ops'),
      table.startedAt.desc().nullsFirst().op('timestamptz_ops')
    ),
    index('idx_sync_runs_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'sync_runs_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.locationId],
      foreignColumns: [locations.id],
      name: 'sync_runs_location_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    reviewId: uuid('review_id').notNull(),
    recipientUserId: uuid('recipient_user_id').notNull(),
    generationGroupId: uuid('generation_group_id'),
    type: notificationType().default('escalation').notNull(),
    channel: notificationChannel().notNull(),
    status: notificationStatus().default('pending').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_notifications_generation_group_id').using(
      'btree',
      table.generationGroupId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_notifications_recipient_user_id').using(
      'btree',
      table.recipientUserId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_notifications_review_id').using(
      'btree',
      table.reviewId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_notifications_review_recipient_type').using(
      'btree',
      table.reviewId.asc().nullsLast().op('uuid_ops'),
      table.recipientUserId.asc().nullsLast().op('enum_ops'),
      table.type.asc().nullsLast().op('uuid_ops'),
      table.generationGroupId.asc().nullsLast().op('enum_ops')
    ),
    index('idx_notifications_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'notifications_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.reviewId],
      foreignColumns: [reviews.id],
      name: 'notifications_review_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.recipientUserId],
      foreignColumns: [users.id],
      name: 'notifications_recipient_user_id_fkey',
    }).onDelete('restrict'),
  ]
);

export const inAppNotifications = pgTable(
  'in_app_notifications',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    type: inAppNotificationType().notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text(),
    reviewId: uuid('review_id'),
    notificationId: uuid('notification_id'),
    generationGroupId: uuid('generation_group_id'),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_in_app_notifications_dedupe').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.type.asc().nullsLast().op('enum_ops'),
      table.reviewId.asc().nullsLast().op('enum_ops'),
      table.generationGroupId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_in_app_notifications_review_id').using(
      'btree',
      table.reviewId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_in_app_notifications_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_in_app_notifications_user_created').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops'),
      table.createdAt.desc().nullsFirst().op('uuid_ops'),
      table.id.desc().nullsFirst().op('timestamptz_ops')
    ),
    index('idx_in_app_notifications_user_unread')
      .using('btree', table.userId.asc().nullsLast().op('uuid_ops'))
      .where(sql`(read_at IS NULL)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'in_app_notifications_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'in_app_notifications_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.reviewId],
      foreignColumns: [reviews.id],
      name: 'in_app_notifications_review_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.notificationId],
      foreignColumns: [notifications.id],
      name: 'in_app_notifications_notification_id_fkey',
    }).onDelete('set null'),
  ]
);

export const prompts = pgTable(
  'prompts',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    category: promptCategory().notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: varchar({ length: 500 }),
    tone: promptTone().default('professional').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_prompts_tenant_id_category').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops'),
      table.category.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'prompts_tenant_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    promptId: uuid('prompt_id').notNull(),
    version: integer().notNull(),
    template: varchar({ length: 1000 }).notNull(),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_prompt_versions_prompt_id_version').using(
      'btree',
      table.promptId.asc().nullsLast().op('int4_ops'),
      table.version.asc().nullsLast().op('int4_ops')
    ),
    foreignKey({
      columns: [table.promptId],
      foreignColumns: [prompts.id],
      name: 'prompt_versions_prompt_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
      name: 'prompt_versions_created_by_user_id_fkey',
    }).onDelete('set null'),
    check('prompt_versions_version_check', sql`version > 0`),
  ]
);

export const reviewResponses = pgTable(
  'review_responses',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    reviewId: uuid('review_id').notNull(),
    generationGroupId: uuid('generation_group_id'),
    responseType: responseType('response_type').notNull(),
    content: text().notNull(),
    source: responseSource().notNull(),
    status: responseStatus().default('draft').notNull(),
    createdByUserId: uuid('created_by_user_id'),
    approvedByUserId: uuid('approved_by_user_id'),
    rejectedByUserId: uuid('rejected_by_user_id'),
    postedAt: timestamp('posted_at', { withTimezone: true, mode: 'string' }),
    errorMessage: text('error_message'),
    generationMetadata: jsonb('generation_metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    promptVersionId: uuid('prompt_version_id'),
    originalContent: text('original_content'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'string' }),
  },
  table => [
    index('idx_review_responses_approved_by_user_id').using(
      'btree',
      table.approvedByUserId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_review_responses_rejected_by_user_id').using(
      'btree',
      table.rejectedByUserId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_review_responses_created_by_user_id').using(
      'btree',
      table.createdByUserId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_review_responses_generation_group_id').using(
      'btree',
      table.generationGroupId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_review_responses_prompt_version_id').using(
      'btree',
      table.promptVersionId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_review_responses_review_id').using(
      'btree',
      table.reviewId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_review_responses_review_id_imported')
      .using('btree', table.reviewId.asc().nullsLast().op('uuid_ops'))
      .where(sql`(source = 'imported'::response_source)`),
    uniqueIndex('idx_review_responses_review_id_live_reply')
      .using('btree', table.reviewId.asc().nullsLast().op('uuid_ops'))
      .where(sql`(status = ANY (ARRAY['approved'::response_status, 'posted'::response_status]))`),
    index('idx_review_responses_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops')
    ),
    index('idx_review_responses_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'review_responses_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.reviewId],
      foreignColumns: [reviews.id],
      name: 'review_responses_review_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
      name: 'review_responses_created_by_user_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.approvedByUserId],
      foreignColumns: [users.id],
      name: 'review_responses_approved_by_user_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.rejectedByUserId],
      foreignColumns: [users.id],
      name: 'review_responses_rejected_by_user_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.promptVersionId],
      foreignColumns: [promptVersions.id],
      name: 'review_responses_prompt_version_id_fkey',
    }).onDelete('set null'),
  ]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    userId: uuid('user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_refresh_tokens_token_hash').using(
      'btree',
      table.tokenHash.asc().nullsLast().op('text_ops')
    ),
    index('idx_refresh_tokens_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'refresh_tokens_user_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const platformSettings = pgTable(
  'platform_settings',
  {
    id: smallint().default(1).primaryKey().notNull(),
    ssoLoginEnabled: boolean('sso_login_enabled').default(true).notNull(),
    passwordLoginEnabled: boolean('password_login_enabled').default(false).notNull(),
    socialLoginEnabled: boolean('social_login_enabled').default(false).notNull(),
    inviteMembersEnabled: boolean('invite_members_enabled').default(false).notNull(),
    updatedByPlatformAdminId: uuid('updated_by_platform_admin_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    foreignKey({
      columns: [table.updatedByPlatformAdminId],
      foreignColumns: [platformAdmins.id],
      name: 'platform_settings_updated_by_platform_admin_id_fkey',
    }).onDelete('set null'),
    check('platform_settings_id_check', sql`id = 1`),
    check(
      'platform_settings_at_least_one_method_check',
      sql`${table.ssoLoginEnabled} OR ${table.passwordLoginEnabled} OR ${table.socialLoginEnabled}`
    ),
  ]
);

export const platformActivityLog = pgTable(
  'platform_activity_log',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    type: platformActivityType().notNull(),
    actorPlatformAdminId: uuid('actor_platform_admin_id'),
    actorEmail: varchar('actor_email', { length: 255 }).notNull(),
    tenantId: uuid('tenant_id'),
    businessName: varchar('business_name', { length: 255 }),
    targetEmail: varchar('target_email', { length: 255 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_platform_activity_log_actor_platform_admin_id').using(
      'btree',
      table.actorPlatformAdminId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_platform_activity_log_occurred_at').using(
      'btree',
      table.occurredAt.desc().nullsFirst().op('timestamptz_ops')
    ),
    index('idx_platform_activity_log_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.actorPlatformAdminId],
      foreignColumns: [platformAdmins.id],
      name: 'platform_activity_log_actor_platform_admin_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'platform_activity_log_tenant_id_fkey',
    }).onDelete('set null'),
    check(
      'platform_activity_log_target_check',
      sql`((type = ANY (ARRAY['business_suspended'::platform_activity_type, 'business_reactivated'::platform_activity_type, 'business_erasure_requested'::platform_activity_type, 'business_erasure_cancelled'::platform_activity_type, 'business_erased'::platform_activity_type])) AND (business_name IS NOT NULL) AND (target_email IS NULL)) OR ((type = ANY (ARRAY['admin_invite_sent'::platform_activity_type, 'admin_invite_revoked'::platform_activity_type, 'admin_disabled'::platform_activity_type, 'admin_enabled'::platform_activity_type])) AND (target_email IS NOT NULL) AND (business_name IS NULL) AND (tenant_id IS NULL)) OR ((type = ANY (ARRAY['user_activated'::platform_activity_type, 'user_deactivated'::platform_activity_type])) AND (target_email IS NOT NULL) AND (business_name IS NOT NULL))`
    ),
  ]
);

export const media = pgTable(
  'media',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    kind: mediaKind().notNull(),
    userId: uuid('user_id'),
    platformAdminId: uuid('platform_admin_id'),
    provider: varchar({ length: 50 }).notNull(),
    providerAssetId: varchar('provider_asset_id', { length: 255 }).notNull(),
    url: varchar({ length: 2048 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_media_user_kind')
      .using(
        'btree',
        table.userId.asc().nullsLast().op('uuid_ops'),
        table.kind.asc().nullsLast().op('enum_ops')
      )
      .where(sql`(user_id IS NOT NULL)`),
    uniqueIndex('idx_media_platform_admin_kind')
      .using(
        'btree',
        table.platformAdminId.asc().nullsLast().op('uuid_ops'),
        table.kind.asc().nullsLast().op('enum_ops')
      )
      .where(sql`(platform_admin_id IS NOT NULL)`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'media_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.platformAdminId],
      foreignColumns: [platformAdmins.id],
      name: 'media_platform_admin_id_fkey',
    }).onDelete('cascade'),
    check(
      'media_exactly_one_owner',
      sql`((user_id IS NOT NULL) AND (platform_admin_id IS NULL)) OR ((user_id IS NULL) AND (platform_admin_id IS NOT NULL))`
    ),
  ]
);

export const billingPlans = pgTable(
  'billing_plans',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    code: billingPlanCode().notNull(),
    stripeProductId: varchar('stripe_product_id', { length: 255 }),
    stripePriceId: varchar('stripe_price_id', { length: 255 }),
    maxLocations: smallint('max_locations'),
    maxAiDraftsPerMonth: smallint('max_ai_drafts_per_month'),
    maxTeamMembers: smallint('max_team_members'),
    customPromptsEnabled: boolean('custom_prompts_enabled').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [unique('billing_plans_code_key').on(table.code)]
);

export const tenantSubscriptions = pgTable(
  'tenant_subscriptions',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    planId: uuid('plan_id').notNull(),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    status: subscriptionStatus(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true, mode: 'string' }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true, mode: 'string' }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    stripeLastVerifiedAt: timestamp('stripe_last_verified_at', {
      withTimezone: true,
      mode: 'string',
    }),
    checkoutStartedAt: timestamp('checkout_started_at', { withTimezone: true, mode: 'string' }),
  },
  table => [
    uniqueIndex('idx_tenant_subscriptions_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_tenant_subscriptions_plan_id').using(
      'btree',
      table.planId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_tenant_subscriptions_status').using(
      'btree',
      table.status.asc().nullsLast().op('enum_ops')
    ),
    uniqueIndex('idx_tenant_subscriptions_stripe_customer_id')
      .using('btree', table.stripeCustomerId.asc().nullsLast().op('text_ops'))
      .where(sql`(stripe_customer_id IS NOT NULL)`),
    uniqueIndex('idx_tenant_subscriptions_stripe_subscription_id')
      .using('btree', table.stripeSubscriptionId.asc().nullsLast().op('text_ops'))
      .where(sql`(stripe_subscription_id IS NOT NULL)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'tenant_subscriptions_tenant_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.planId],
      foreignColumns: [billingPlans.id],
      name: 'tenant_subscriptions_plan_id_fkey',
    }).onDelete('restrict'),
  ]
);

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
  id: varchar({ length: 255 }).primaryKey().notNull(),
  type: varchar({ length: 255 }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
});

export const billingReceipts = pgTable(
  'billing_receipts',
  {
    id: uuid()
      .default(sql`uuidv7()`)
      .primaryKey()
      .notNull(),
    tenantId: uuid('tenant_id').notNull(),
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 255 }).notNull(),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    amountPaid: integer('amount_paid').notNull(),
    currency: varchar({ length: 3 }).notNull(),
    invoiceNumber: varchar('invoice_number', { length: 255 }),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex('idx_billing_receipts_stripe_invoice_id').using(
      'btree',
      table.stripeInvoiceId.asc().nullsLast().op('text_ops')
    ),
    index('idx_billing_receipts_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'billing_receipts_tenant_id_fkey',
    }).onDelete('cascade'),
  ]
);
