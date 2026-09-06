import { relations } from 'drizzle-orm/relations';

import {
  blocklistTerms,
  locations,
  notificationRecipients,
  notifications,
  passwordResetTokens,
  platformAdminIdentities,
  platformAdminInvites,
  platformAdmins,
  prompts,
  promptVersions,
  reviewProviderConnections,
  reviewResponses,
  reviews,
  syncRuns,
  tenantIdentityProviders,
  tenants,
  tenantSettings,
  userIdentities,
  userLocations,
  users,
} from './schema';

export const platformAdminsRelations = relations(platformAdmins, ({ one, many }) => ({
  platformAdmin: one(platformAdmins, {
    fields: [platformAdmins.invitedByPlatformAdminId],
    references: [platformAdmins.id],
    relationName: 'platformAdmins_invitedByPlatformAdminId_platformAdmins_id',
  }),
  platformAdmins: many(platformAdmins, {
    relationName: 'platformAdmins_invitedByPlatformAdminId_platformAdmins_id',
  }),
  platformAdminIdentities: many(platformAdminIdentities),
  platformAdminInvites: many(platformAdminInvites),
  tenants: many(tenants),
}));

export const platformAdminIdentitiesRelations = relations(platformAdminIdentities, ({ one }) => ({
  platformAdmin: one(platformAdmins, {
    fields: [platformAdminIdentities.platformAdminId],
    references: [platformAdmins.id],
  }),
}));

export const platformAdminInvitesRelations = relations(platformAdminInvites, ({ one }) => ({
  platformAdmin: one(platformAdmins, {
    fields: [platformAdminInvites.platformAdminId],
    references: [platformAdmins.id],
  }),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  platformAdmin: one(platformAdmins, {
    fields: [tenants.createdByPlatformAdminId],
    references: [platformAdmins.id],
  }),
  tenantIdentityProviders: many(tenantIdentityProviders),
  users: many(users),
  tenantSettings: many(tenantSettings),
  blocklistTerms: many(blocklistTerms),
  reviewProviderConnections: many(reviewProviderConnections),
  notificationRecipients: many(notificationRecipients),
  locations: many(locations),
  reviews: many(reviews),
  syncRuns: many(syncRuns),
  notifications: many(notifications),
  prompts: many(prompts),
  reviewResponses: many(reviewResponses),
}));

export const tenantIdentityProvidersRelations = relations(tenantIdentityProviders, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantIdentityProviders.tenantId],
    references: [tenants.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [users.invitedByUserId],
    references: [users.id],
    relationName: 'users_invitedByUserId_users_id',
  }),
  users: many(users, {
    relationName: 'users_invitedByUserId_users_id',
  }),
  userIdentities: many(userIdentities),
  passwordResetTokens: many(passwordResetTokens),
  reviewProviderConnections: many(reviewProviderConnections),
  notificationRecipients: many(notificationRecipients),
  userLocations: many(userLocations),
  notifications: many(notifications),
  promptVersions: many(promptVersions),
  reviewResponses_createdByUserId: many(reviewResponses, {
    relationName: 'reviewResponses_createdByUserId_users_id',
  }),
  reviewResponses_approvedByUserId: many(reviewResponses, {
    relationName: 'reviewResponses_approvedByUserId_users_id',
  }),
}));

export const tenantSettingsRelations = relations(tenantSettings, ({ one }) => ({
  tenant: one(tenants, {
    fields: [tenantSettings.tenantId],
    references: [tenants.id],
  }),
}));

export const blocklistTermsRelations = relations(blocklistTerms, ({ one }) => ({
  tenant: one(tenants, {
    fields: [blocklistTerms.tenantId],
    references: [tenants.id],
  }),
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const reviewProviderConnectionsRelations = relations(
  reviewProviderConnections,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [reviewProviderConnections.tenantId],
      references: [tenants.id],
    }),
    user: one(users, {
      fields: [reviewProviderConnections.connectedByUserId],
      references: [users.id],
    }),
    locations: many(locations),
  })
);

export const notificationRecipientsRelations = relations(notificationRecipients, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notificationRecipients.tenantId],
    references: [tenants.id],
  }),
  user: one(users, {
    fields: [notificationRecipients.userId],
    references: [users.id],
  }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [locations.tenantId],
    references: [tenants.id],
  }),
  reviewProviderConnection: one(reviewProviderConnections, {
    fields: [locations.providerConnectionId],
    references: [reviewProviderConnections.id],
  }),
  userLocations: many(userLocations),
  reviews: many(reviews),
  syncRuns: many(syncRuns),
}));

export const userLocationsRelations = relations(userLocations, ({ one }) => ({
  user: one(users, {
    fields: [userLocations.userId],
    references: [users.id],
  }),
  location: one(locations, {
    fields: [userLocations.locationId],
    references: [locations.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [reviews.tenantId],
    references: [tenants.id],
  }),
  location: one(locations, {
    fields: [reviews.locationId],
    references: [locations.id],
  }),
  notifications: many(notifications),
  reviewResponses: many(reviewResponses),
}));

export const syncRunsRelations = relations(syncRuns, ({ one }) => ({
  tenant: one(tenants, {
    fields: [syncRuns.tenantId],
    references: [tenants.id],
  }),
  location: one(locations, {
    fields: [syncRuns.locationId],
    references: [locations.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
  review: one(reviews, {
    fields: [notifications.reviewId],
    references: [reviews.id],
  }),
  user: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
  }),
}));

export const promptsRelations = relations(prompts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [prompts.tenantId],
    references: [tenants.id],
  }),
  promptVersions: many(promptVersions),
}));

export const promptVersionsRelations = relations(promptVersions, ({ one, many }) => ({
  prompt: one(prompts, {
    fields: [promptVersions.promptId],
    references: [prompts.id],
  }),
  user: one(users, {
    fields: [promptVersions.createdByUserId],
    references: [users.id],
  }),
  reviewResponses: many(reviewResponses),
}));

export const reviewResponsesRelations = relations(reviewResponses, ({ one }) => ({
  tenant: one(tenants, {
    fields: [reviewResponses.tenantId],
    references: [tenants.id],
  }),
  review: one(reviews, {
    fields: [reviewResponses.reviewId],
    references: [reviews.id],
  }),
  user_createdByUserId: one(users, {
    fields: [reviewResponses.createdByUserId],
    references: [users.id],
    relationName: 'reviewResponses_createdByUserId_users_id',
  }),
  user_approvedByUserId: one(users, {
    fields: [reviewResponses.approvedByUserId],
    references: [users.id],
    relationName: 'reviewResponses_approvedByUserId_users_id',
  }),
  promptVersion: one(promptVersions, {
    fields: [reviewResponses.promptVersionId],
    references: [promptVersions.id],
  }),
}));
