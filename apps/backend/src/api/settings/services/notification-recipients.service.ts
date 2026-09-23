import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth-user.type';
import {
  NotificationRecipientDto,
  NotificationRecipientListResponseDto,
} from '../dto/notification-recipient-response.dto';
import type { UpdateNotificationRecipientDto } from '../dto/update-notification-recipient.dto';
import {
  NotificationRecipientNoFieldsException,
  NotificationRecipientNotFoundException,
} from '../exceptions/settings.exceptions';

@Injectable()
export class NotificationRecipientsService {
  constructor(private readonly settingsDbService: SettingsDbService) {}

  async list(user: AuthUser): Promise<NotificationRecipientListResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);
    const rows = await this.settingsDbService.listNotificationRecipients(tenantUser.tenantId);
    return NotificationRecipientListResponseDto.from(rows);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateNotificationRecipientDto
  ): Promise<NotificationRecipientDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.SETTINGS.TENANT_ONLY);

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

    return NotificationRecipientDto.from(row);
  }
}
