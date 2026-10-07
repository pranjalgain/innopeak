import type { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type {
  NotificationRecipientRecord,
  UpdateNotificationRecipientInput,
} from '../../../api/settings/types/settings.type';

@Injectable()
export class NotificationRecipientsRepository {
  constructor(private readonly dbService: DBService) {}

  async listByTenant(tenantId: string): Promise<NotificationRecipientRecord[]> {
    const rows = await this.dbService.db
      .select({
        id: schema.notificationRecipients.id,
        userId: schema.notificationRecipients.userId,
        name: schema.users.name,
        channel: schema.notificationRecipients.channel,
        isActive: schema.notificationRecipients.isActive,
      })
      .from(schema.notificationRecipients)
      .innerJoin(schema.users, eq(schema.users.id, schema.notificationRecipients.userId))
      .where(eq(schema.notificationRecipients.tenantId, tenantId))
      .orderBy(schema.users.name);

    return rows.map(row => ({
      ...row,
      // `users.name` is nullable (GDPR anonymize-in-place keeps the recipient row), but the DTO and frontend assume a display name, so fall back to a label here.
      name: row.name ?? 'Removed team member',
      channel: row.channel as NotificationChannelPref,
    }));
  }

  /**
   * Null when `id` doesn't exist for this tenant: the `tenant_id` in the WHERE is what makes that a 404 rather than a cross-tenant write.
   * One `UPDATE … FROM users … RETURNING users.name` returns the owner's name with the row (as `listByTenant` does); a recipient can't outlive its user.
   * No `updated_at` triggers exist in this schema, so every writer stamps it itself.
   */
  async updateForTenant(
    input: UpdateNotificationRecipientInput
  ): Promise<NotificationRecipientRecord | null> {
    const { id, tenantId, ...changes } = input;

    const rows = await this.dbService.db
      .update(schema.notificationRecipients)
      .set({ ...changes, updatedAt: sql`now()` })
      .from(schema.users)
      .where(
        and(
          eq(schema.notificationRecipients.id, id),
          eq(schema.notificationRecipients.tenantId, tenantId),
          eq(schema.users.id, schema.notificationRecipients.userId)
        )
      )
      .returning({
        id: schema.notificationRecipients.id,
        userId: schema.notificationRecipients.userId,
        name: schema.users.name,
        channel: schema.notificationRecipients.channel,
        isActive: schema.notificationRecipients.isActive,
      });

    const updated = rows[0];
    return updated === undefined
      ? null
      : {
          ...updated,
          // Same fallback as `listByTenant` — see its own comment.
          name: updated.name ?? 'Removed team member',
          channel: updated.channel as NotificationChannelPref,
        };
  }
}
