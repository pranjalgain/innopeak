import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { NotificationRecipientsService } from './notification-recipients.service';

import { JwtTokenType } from '../../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../../auth/types/auth-user.type';

describe('NotificationRecipientsService', () => {
  let target: NotificationRecipientsService;
  let settingsDbService: {
    listNotificationRecipients: jest.Mock;
    updateNotificationRecipient: jest.Mock;
  };

  const tenantUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'owner@example.com',
    role: UserRole.OWNER,
    locale: null,
  };

  beforeEach(async () => {
    settingsDbService = {
      listNotificationRecipients: jest.fn(),
      updateNotificationRecipient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRecipientsService,
        { provide: SettingsDbService, useValue: settingsDbService },
      ],
    }).compile();

    target = module.get(NotificationRecipientsService);
  });

  it('lists recipients for the caller tenant', async () => {
    settingsDbService.listNotificationRecipients.mockResolvedValue([
      {
        id: 'r1',
        userId: 'user-1',
        name: 'Maria Delgado',
        channel: NotificationChannelPref.EMAIL,
        isActive: true,
      },
    ]);

    const result = await target.list(tenantUser);

    expect(settingsDbService.listNotificationRecipients).toHaveBeenCalledWith('tenant-1');
    expect(result.items[0]).toMatchObject({ name: 'Maria Delgado', initials: 'MD' });
  });

  it('rejects an update with neither field set', async () => {
    await expect(target.update(tenantUser, 'r1', {})).rejects.toThrow(BadRequestException);
    await expect(target.update(tenantUser, 'r1', {})).rejects.toThrow(
      MESSAGES.SETTINGS.NOTIFICATION_RECIPIENT_NO_FIELDS
    );
    expect(settingsDbService.updateNotificationRecipient).not.toHaveBeenCalled();
  });

  it('scopes the update to the caller tenant and passes only the fields provided', async () => {
    settingsDbService.updateNotificationRecipient.mockResolvedValue({
      id: 'r1',
      userId: 'user-1',
      name: 'Maria Delgado',
      channel: NotificationChannelPref.BOTH,
      isActive: true,
    });

    await target.update(tenantUser, 'r1', { channel: NotificationChannelPref.BOTH });

    expect(settingsDbService.updateNotificationRecipient).toHaveBeenCalledWith({
      id: 'r1',
      tenantId: 'tenant-1',
      channel: NotificationChannelPref.BOTH,
    });
  });

  it('returns 404 when updating a recipient that is not this tenant’s', async () => {
    settingsDbService.updateNotificationRecipient.mockResolvedValue(null);

    await expect(target.update(tenantUser, 'missing-id', { isActive: false })).rejects.toThrow(
      NotFoundException
    );
  });
});
