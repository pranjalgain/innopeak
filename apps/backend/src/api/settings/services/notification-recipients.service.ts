import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import type { Locale } from '@common/i18n/locale';
import { renderMessage } from '@common/i18n/message-registry';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth.type';
import {
  NotificationRecipientDto,
  NotificationRecipientListResponseDto,
} from '../dto/notification-recipient-response.dto';
import type { UpdateNotificationRecipientDto } from '../dto/update-notification-recipient.dto';
import {
  NotificationRecipientNoFieldsException,
  NotificationRecipientNotFoundException,
  NotificationSettingsDisabledException,
} from '../exceptions/settings.exceptions';

/** Data fields are not rendered at the response edge (only `message` is), so the label is picked here, in the caller's language. */
function removedMemberName(locale: Locale | null): string {
  return renderMessage(MESSAGES.SETTINGS.REMOVED_TEAM_MEMBER, locale ?? 'en');
}

@Injectable()
export class NotificationRecipientsService {
  constructor(
    private readonly settingsDbService: SettingsDbService,
    private readonly platformSettingsDbService: PlatformSettingsDbService
  ) {}

  /** Phase one has no notification preferences: both routes answer 403 while the platform setting is off (it defaults to off). */
  private async assertSettingsEnabled(): Promise<void> {
    const platformSettings = await this.platformSettingsDbService.get();
    if (platformSettings?.notificationSettingsEnabled !== true) {
      throw new NotificationSettingsDisabledException();
    }
  }

  async list(user: AuthUser): Promise<NotificationRecipientListResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    await this.assertSettingsEnabled();
    const rows = await this.settingsDbService.listNotificationRecipients(tenantUser.tenantId);
    return NotificationRecipientListResponseDto.from(rows, removedMemberName(tenantUser.locale));
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateNotificationRecipientDto
  ): Promise<NotificationRecipientDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    await this.assertSettingsEnabled();

    // A whole-object rule, not a per-property one — see the DTO's own comment on why this isn't
    // a class-validator decorator.
    if (dto.channel === undefined && dto.isActive === undefined) {
      throw new NotificationRecipientNoFieldsException();
    }

    const row = await this.settingsDbService.updateNotificationRecipient({
      id,
      tenantId: tenantUser.tenantId,
      ...(dto.channel !== undefined && { channel: dto.channel }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });

    if (row === null) {
      throw new NotificationRecipientNotFoundException();
    }

    return NotificationRecipientDto.from(row, removedMemberName(tenantUser.locale));
  }
}
