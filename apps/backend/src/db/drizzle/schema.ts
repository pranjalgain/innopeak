import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true }).defaultNow(),
    requestedApi: varchar('requested_api', { length: 255 }),
    appVersion: varchar('app_version', { length: 50 }),
    systemName: varchar('system_name', { length: 100 }),
    systemVersion: varchar('system_version', { length: 50 }),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    country: varchar('country', { length: 100 }),
    hostName: varchar('host_name', { length: 255 }),
    tableName: varchar('table_name', { length: 100 }),
    operationType: varchar('operation_type', { length: 50 }),
    severity: varchar('severity', { length: 20 }),
    description: text('description'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  table => [
    index('idx_audit_logs_event_timestamp').on(table.eventTimestamp),
    index('idx_audit_logs_severity').on(table.severity),
    index('idx_audit_logs_table_operation').on(table.tableName, table.operationType),
    index('idx_audit_logs_requested_api').on(table.requestedApi),
    index('idx_audit_logs_country').on(table.country),
    check(
      'operation_type_check',
      sql`${table.operationType} IN ('VIEW', 'INSERT', 'UPDATE', 'DELETE')`
    ),
    check('severity_check', sql`${table.severity} IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`),
  ]
);

// ─── DB Audit Logs ──────────────────────────────────────────────────────────

export const dbAuditLogs = pgTable(
  'db_audit_logs',
  {
    id: serial('id').primaryKey(),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true }).defaultNow(),
    tableName: varchar('table_name', { length: 100 }).notNull(),
    operationType: varchar('operation_type', { length: 10 }).notNull(),
    dbUser: varchar('db_user', { length: 100 }),
    dbName: varchar('db_name', { length: 100 }),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    triggeredBy: text('triggered_by').default(sql`CURRENT_USER`),
  },
  table => [
    check('db_operation_type_check', sql`${table.operationType} IN ('INSERT', 'UPDATE', 'DELETE')`),
  ]
);

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    firstName: varchar('first_name', { length: 100 }),
    lastName: varchar('last_name', { length: 100 }),
    phone: varchar('phone', { length: 20 }),
    isActive: boolean('is_active').notNull().default(true),
    isEmailVerified: boolean('is_email_verified').notNull().default(false),
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  table => [
    index('idx_users_email').on(table.email),
    index('idx_users_is_active').on(table.isActive),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  userRoles: many(userRoles),
  refreshTokens: many(refreshTokens),
  apiKeys: many(apiKeys),
  mfaSettings: many(mfaSettings),
  oauthAccounts: many(oauthAccounts),
}));

// ─── Roles ──────────────────────────────────────────────────────────────────

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  description: varchar('description', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

// ─── Permissions ────────────────────────────────────────────────────────────

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    description: varchar('description', { length: 255 }),
    resource: varchar('resource', { length: 100 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('idx_permissions_resource_action').on(table.resource, table.action)]
);

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

// ─── User Roles (Many-to-Many) ─────────────────────────────────────────────

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index('idx_user_roles_user_id').on(table.userId),
    index('idx_user_roles_role_id').on(table.roleId),
  ]
);

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

// ─── Role Permissions (Many-to-Many) ───────────────────────────────────────

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  table => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index('idx_role_permissions_role_id').on(table.roleId),
  ]
);

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

// ─── Refresh Tokens ─────────────────────────────────────────────────────────

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    deviceInfo: varchar('device_info', { length: 500 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_refresh_tokens_user_id').on(table.userId),
    index('idx_refresh_tokens_token_hash').on(table.tokenHash),
    index('idx_refresh_tokens_expires_at').on(table.expiresAt),
  ]
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

// ─── API Keys ───────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    keyHash: varchar('key_hash', { length: 255 }).notNull(),
    prefix: varchar('prefix', { length: 8 }).notNull(),
    scopes: jsonb('scopes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_api_keys_user_id').on(table.userId),
    index('idx_api_keys_prefix').on(table.prefix),
    index('idx_api_keys_key_hash').on(table.keyHash),
  ]
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

// ─── MFA Settings ───────────────────────────────────────────────────────────

export const mfaSettings = pgTable(
  'mfa_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 10 }).notNull(),
    secretEncrypted: text('secret_encrypted').notNull(),
    isVerified: boolean('is_verified').notNull().default(false),
    backupCodesHash: jsonb('backup_codes_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('idx_mfa_settings_user_type').on(table.userId, table.type),
    check('mfa_type_check', sql`${table.type} IN ('totp', 'sms')`),
  ]
);

export const mfaSettingsRelations = relations(mfaSettings, ({ one }) => ({
  user: one(users, { fields: [mfaSettings.userId], references: [users.id] }),
}));

// ─── OAuth Accounts ─────────────────────────────────────────────────────────

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 20 }).notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('idx_oauth_accounts_provider_user').on(table.provider, table.providerUserId),
    index('idx_oauth_accounts_user_id').on(table.userId),
    check('oauth_provider_check', sql`${table.provider} IN ('google', 'github', 'apple')`),
  ]
);

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}));

// ─── Media ──────────────────────────────────────────────────────────────────

export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 500 }).notNull(),
    originalName: varchar('original_name', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    size: text('size').notNull(), // bigint as text for JS compatibility
    storageProvider: varchar('storage_provider', { length: 50 }).notNull(),
    storageKey: varchar('storage_key', { length: 1000 }).notNull(),
    url: text('url'),
    thumbnailUrl: text('thumbnail_url'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_media_user_id').on(table.userId),
    index('idx_media_storage_provider').on(table.storageProvider),
    index('idx_media_mime_type').on(table.mimeType),
    index('idx_media_created_at').on(table.createdAt),
  ]
);

export const mediaRelations = relations(media, ({ one }) => ({
  user: one(users, { fields: [media.userId], references: [users.id] }),
}));

// ─── Notifications ──────────────────────────────────────────────────────────

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 500 }).notNull(),
    body: text('body').notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    data: jsonb('data').default(sql`'{}'::jsonb`),
    channel: varchar('channel', { length: 20 }).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_notifications_user_id').on(table.userId),
    index('idx_notifications_channel').on(table.channel),
    index('idx_notifications_is_read').on(table.userId, table.isRead),
    index('idx_notifications_created_at').on(table.createdAt),
    check(
      'notification_channel_check',
      sql`${table.channel} IN ('push', 'email', 'sms', 'in-app')`
    ),
  ]
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

// ─── Device Tokens ──────────────────────────────────────────────────────────

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fid: text('fid').notNull(),
    platform: varchar('platform', { length: 10 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_device_tokens_user_id').on(table.userId),
    uniqueIndex('idx_device_tokens_fid').on(table.fid),
    check('device_platform_check', sql`${table.platform} IN ('ios', 'android', 'web')`),
  ]
);

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  user: one(users, { fields: [deviceTokens.userId], references: [users.id] }),
}));

// ─── Documents (RAG) ────────────────────────────────────────────────────────

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 500 }),
  source: varchar('source', { length: 1000 }),
  content: text('content'),
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const documentsRelations = relations(documents, ({ many }) => ({
  chunks: many(documentChunks),
}));

// ─── Document Chunks (RAG + pgvector) ───────────────────────────────────────

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: text('embedding'), // stored as vector(1536) in DB, handled via raw SQL
    chunkIndex: serial('chunk_index').notNull(),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('idx_document_chunks_document_id').on(table.documentId)]
);

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}));

// ─── Conversations (AI Agents) ──────────────────────────────────────────────

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 500 }),
    model: varchar('model', { length: 100 }).notNull(),
    systemPrompt: text('system_prompt'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_conversations_user_id').on(table.userId),
    index('idx_conversations_updated_at').on(table.updatedAt),
  ]
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  messages: many(messages),
}));

// ─── Messages (AI Agents) ───────────────────────────────────────────────────

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    toolCalls: jsonb('tool_calls'),
    tokenCount: serial('token_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_messages_conversation_id').on(table.conversationId),
    index('idx_messages_created_at').on(table.createdAt),
    check('message_role_check', sql`${table.role} IN ('user', 'assistant', 'system', 'tool')`),
  ]
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

// ─── Webhooks ──────────────────────────────────────────────────────────────

export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2048 }).notNull(),
    secret: varchar('secret', { length: 255 }).notNull(),
    events: text('events')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isActive: boolean('is_active').notNull().default(true),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('idx_webhooks_user_id').on(table.userId)]
);

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  user: one(users, { fields: [webhooks.userId], references: [users.id] }),
  deliveries: many(webhookDeliveries),
}));

// ─── Webhook Deliveries ────────────────────────────────────────────────────

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    event: varchar('event', { length: 255 }).notNull(),
    payload: jsonb('payload').notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    attempt: integer('attempt').notNull().default(1),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('idx_webhook_deliveries_webhook_id').on(table.webhookId),
    index('idx_webhook_deliveries_status').on(table.status),
  ]
);

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, { fields: [webhookDeliveries.webhookId], references: [webhooks.id] }),
}));
