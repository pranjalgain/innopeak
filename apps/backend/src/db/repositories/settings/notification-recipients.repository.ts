import type { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type {
  NotificationRecipientRecord,
  UpdateNotificationRecipientInput,
} from '../../../api/settings/types/notification-recipient.type';

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

    return rows.map(row => ({ ...row, channel: row.channel as NotificationChannelPref }));
  }

  /**
   * Returns null when `id` doesn't exist for this tenant — the guarded `WHERE` clause is what
   * makes this a 404 rather than a 500 or, worse, a cross-tenant write: `id` alone would find a
   * row, `tenant_id` is what proves it's this caller's.
   *
   * `UPDATE … FROM users … RETURNING users.name` — one statement, so the owning user's name comes
   * back with the row it belongs to rather than from a second round trip that would have to
   * invent a value for a user that cannot be absent (`user_id` is `NOT NULL REFERENCES users(id)
   * ON DELETE CASCADE`, so a recipient row can never outlive its user). The join is also what
   * `listByTenant` above already does for the same reason.
   *
   * There are no `updated_at` triggers anywhere in this schema — every writer stamps it itself.
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
      : { ...updated, channel: updated.channel as NotificationChannelPref };
  }
}
