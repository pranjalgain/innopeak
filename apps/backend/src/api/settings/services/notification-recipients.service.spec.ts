import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { NotificationRecipientsService } from './notification-recipients.service';

import { JwtTokenType } from '../../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../../auth/types/auth.type';

describe('NotificationRecipientsService', () => {
  let target: NotificationRecipientsService;
  let settingsDbService: {
    listNotificationRecipients: jest.Mock;
    updateNotificationRecipient: jest.Mock;
  };
  let platformSettingsDbService: { get: jest.Mock };

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

    // On: the gate has its own tests below; everything else runs as it will once the setting is enabled.
    platformSettingsDbService = {
      get: jest.fn().mockResolvedValue({ notificationSettingsEnabled: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRecipientsService,
        { provide: SettingsDbService, useValue: settingsDbService },
        { provide: PlatformSettingsDbService, useValue: platformSettingsDbService },
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

  // `users.name` is NULL once the user was anonymized in place; the label is the caller's language, picked here because only `message` is rendered at the edge.
  it.each([
    [null, 'Removed team member'],
    ['de' as const, 'Entferntes Teammitglied'],
  ])('labels an anonymized recipient in the caller language (%s)', async (locale, label) => {
    settingsDbService.listNotificationRecipients.mockResolvedValue([
      {
        id: 'r1',
        userId: 'user-2',
        name: null,
        channel: NotificationChannelPref.EMAIL,
        isActive: true,
      },
    ]);

    const result = await target.list({ ...tenantUser, locale });

    expect(result.items[0]).toMatchObject({ name: label });
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

  describe('while notification settings are turned off (the default)', () => {
    it.each([false, null])('refuses to list when the platform setting is %s', async setting => {
      platformSettingsDbService.get.mockResolvedValue(
        setting === null ? null : { notificationSettingsEnabled: setting }
      );

      await expect(target.list(tenantUser)).rejects.toThrow(ForbiddenException);
      await expect(target.list(tenantUser)).rejects.toThrow(
        MESSAGES.SETTINGS.NOTIFICATION_SETTINGS_DISABLED
      );
      expect(settingsDbService.listNotificationRecipients).not.toHaveBeenCalled();
    });

    it('refuses to update and touches nothing', async () => {
      platformSettingsDbService.get.mockResolvedValue({ notificationSettingsEnabled: false });

      await expect(target.update(tenantUser, 'r1', { isActive: false })).rejects.toThrow(
        ForbiddenException
      );
      expect(settingsDbService.updateNotificationRecipient).not.toHaveBeenCalled();
    });
  });

  it('returns 404 when updating a recipient that is not this tenant’s', async () => {
    settingsDbService.updateNotificationRecipient.mockResolvedValue(null);

    await expect(target.update(tenantUser, 'missing-id', { isActive: false })).rejects.toThrow(
      NotFoundException
    );
  });
});
