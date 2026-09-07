import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const auditOperationType = pgEnum('audit_operation_type', ['INSERT', 'UPDATE', 'DELETE']);
export const escalationReason = pgEnum('escalation_reason', ['low_rating', 'blocklist_match']);
export const googleConnectionStatus = pgEnum('google_connection_status', [
  'active',
  'needs_reauth',
]);
export const locationStatus = pgEnum('location_status', ['active', 'inactive']);
export const notificationChannel = pgEnum('notification_channel', ['email', 'teams']);
export const notificationChannelPref = pgEnum('notification_channel_pref', [
  'email',
  'teams',
  'both',
]);
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed']);
export const notificationType = pgEnum('notification_type', ['escalation']);
export const platformAdminInvitePurpose = pgEnum('platform_admin_invite_purpose', [
  'invite',
  'reset',
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
export const syncHealthStatus = pgEnum('sync_health_status', ['ok', 'error']);
export const syncRunStatus = pgEnum('sync_run_status', ['running', 'ok', 'error']);
export const syncTrigger = pgEnum('sync_trigger', ['scheduled', 'backfill']);
export const tenantIdentityProvider = pgEnum('tenant_identity_provider', [
  'entra_id',
  'google_workspace',
]);
export const tenantStatus = pgEnum('tenant_status', ['pending_activation', 'active', 'suspended']);
export const tokenPurpose = pgEnum('token_purpose', ['verify_email', 'invite', 'reset']);
export const userIdentityProvider = pgEnum('user_identity_provider', ['entra_id', 'google']);
export const userRole = pgEnum('user_role', ['owner', 'member']);
export const userStatus = pgEnum('user_status', [
  'pending_verification',
  'invited',
  'active',
  'disabled',
]);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial().primaryKey().notNull(),
    eventTimestamp: timestamp('event_timestamp', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    tableName: varchar('table_name', { length: 100 }).notNull(),
    operationType: auditOperationType('operation_type').notNull(),
    tenantId: uuid('tenant_id'),
    dbUser: varchar('db_user', { length: 100 }),
    dbName: varchar('db_name', { length: 100 }),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    triggeredBy: varchar('triggered_by', { length: 100 }).default(sql`CURRENT_USER`),
  },
  table => [
    index('idx_audit_logs_new_value_gin').using(
      'gin',
      table.newValue.asc().nullsLast().op('jsonb_ops')
    ),
    index('idx_audit_logs_old_value_gin').using(
      'gin',
      table.oldValue.asc().nullsLast().op('jsonb_ops')
    ),
    index('idx_audit_logs_table_name').using(
      'btree',
      table.tableName.asc().nullsLast().op('text_ops')
    ),
    index('idx_audit_logs_tenant_id').using(
      'btree',
      table.tenantId.asc().nullsLast().op('uuid_ops')
    ),
  ]
);

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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_tenants_created_by_platform_admin_id').using(
      'btree',
      table.createdByPlatformAdminId.asc().nullsLast().op('uuid_ops')
    ),
    index('idx_tenants_status').using('btree', table.status.asc().nullsLast().op('enum_ops')),
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
    name: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true, mode: 'string' }),
    invitedByUserId: uuid('invited_by_user_id'),
    role: userRole().notNull(),
    status: userStatus().notNull(),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
    index('idx_users_invited_by_user_id').using(
      'btree',
      table.invitedByUserId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_users_email_active')
      .using('btree', table.email.asc().nullsLast().op('text_ops'))
      .where(sql`(anonymized_at IS NULL)`),
    index('idx_users_role').using('btree', table.role.asc().nullsLast().op('enum_ops')),
    index('idx_users_status').using('btree', table.status.asc().nullsLast().op('enum_ops')),
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
    isActive: boolean('is_active').default(true).notNull(),
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
    index('idx_refresh_tokens_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('uuid_ops')
    ),
    uniqueIndex('idx_refresh_tokens_token_hash').using(
      'btree',
      table.tokenHash.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'refresh_tokens_user_id_fkey',
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
    provider: reviewProvider().notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    credentialReference: varchar('credential_reference', { length: 255 }).notNull(),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true, mode: 'string' }),
    status: googleConnectionStatus().notNull(),
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
    notificationType: notificationType('notification_type').notNull(),
    channel: notificationChannelPref().notNull(),
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
    provider: reviewProvider().notNull(),
    externalLocationId: varchar('external_location_id', { length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    address: varchar({ length: 500 }),
    status: locationStatus().notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'string' }),
    lastSyncStatus: syncHealthStatus('last_sync_status'),
    lastSyncError: text('last_sync_error'),
    onboardingBackfillCompletedAt: timestamp('onboarding_backfill_completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  table => [
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
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    status: syncRunStatus().notNull(),
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
    index('idx_sync_runs_location_id_started_at').using(
      'btree',
      table.locationId.asc().nullsLast().op('uuid_ops'),
      table.startedAt.desc().nullsFirst().op('timestamptz_ops')
    ),
    uniqueIndex('idx_sync_runs_location_id_running')
      .using('btree', table.locationId.asc().nullsLast().op('uuid_ops'))
      .where(sql`(status = 'running'::sync_run_status)`),
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
    type: notificationType().notNull(),
    channel: notificationChannel().notNull(),
    status: notificationStatus().notNull(),
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
      columns: [table.promptVersionId],
      foreignColumns: [promptVersions.id],
      name: 'review_responses_prompt_version_id_fkey',
    }).onDelete('set null'),
  ]
);
