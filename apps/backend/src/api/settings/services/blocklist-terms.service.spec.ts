import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { messagesDe } from '@common/i18n/messages.de';
import { messagesEn } from '@common/i18n/messages.en';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { ConflictException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { BlocklistTermsService } from './blocklist-terms.service';

import { JwtTokenType } from '../../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../../auth/types/auth.type';
import { MAX_BLOCKLIST_TERMS_PER_TENANT } from '../constants/settings.constants';

describe('BlocklistTermsService', () => {
  let target: BlocklistTermsService;
  let settingsDbService: {
    listBlocklistTerms: jest.Mock;
    insertBlocklistTerm: jest.Mock;
    deleteBlocklistTerm: jest.Mock;
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
      listBlocklistTerms: jest.fn(),
      insertBlocklistTerm: jest.fn(),
      deleteBlocklistTerm: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlocklistTermsService,
        { provide: SettingsDbService, useValue: settingsDbService },
      ],
    }).compile();

    target = module.get(BlocklistTermsService);
  });

  it('lists terms for the caller tenant', async () => {
    settingsDbService.listBlocklistTerms.mockResolvedValue([
      {
        id: 't1',
        term: 'lawsuit',
        createdAt: '2026-08-11T10:03:52Z',
      },
    ]);

    const result = await target.list(tenantUser);

    expect(settingsDbService.listBlocklistTerms).toHaveBeenCalledWith('tenant-1');
    expect(result.total).toBe(1);
    expect(result.items[0]?.term).toBe('lawsuit');
  });

  it('returns 404 when deleting a term that is not this tenant’s', async () => {
    settingsDbService.deleteBlocklistTerm.mockResolvedValue(false);

    await expect(target.remove(tenantUser, 'missing-id')).rejects.toThrow(
      MESSAGES.SETTINGS.BLOCKLIST_TERM_NOT_FOUND
    );
  });

  it('rejects a term the tenant already has, whatever its casing', async () => {
    // The repository's unique index is on lower(term), so DO NOTHING yields no row and the
    // db service returns null. Removal is a hard delete, so there is no inactive row to revive.
    settingsDbService.insertBlocklistTerm.mockResolvedValue({ outcome: 'duplicate' });

    await expect(target.create(tenantUser, 'lawsuit')).rejects.toThrow(ConflictException);
    await expect(target.create(tenantUser, 'lawsuit')).rejects.toThrow(
      MESSAGES.SETTINGS.BLOCKLIST_TERM_EXISTS
    );
  });

  it('creates a term, passing the tenant cap down so it is enforced with the insert', async () => {
    settingsDbService.insertBlocklistTerm.mockResolvedValue({
      outcome: 'created',
      record: { id: 't9', term: 'lawsuit', createdAt: '2026-08-11T10:03:52Z' },
    });

    const result = await target.create(tenantUser, 'lawsuit');

    expect(settingsDbService.insertBlocklistTerm).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      term: 'lawsuit',
      maxTerms: MAX_BLOCKLIST_TERMS_PER_TENANT,
    });
    expect(result.term).toBe('lawsuit');
  });

  it('refuses a term once the tenant is at its limit, with a 409', async () => {
    settingsDbService.insertBlocklistTerm.mockResolvedValue({ outcome: 'limit_reached' });

    await expect(target.create(tenantUser, 'one more')).rejects.toThrow(ConflictException);
    await expect(target.create(tenantUser, 'one more')).rejects.toThrow(
      MESSAGES.SETTINGS.BLOCKLIST_LIMIT_REACHED
    );
  });

  it('keeps the user-facing limit message in step with the real cap', () => {
    expect(messagesEn.SETTINGS.BLOCKLIST_LIMIT_REACHED).toContain(
      String(MAX_BLOCKLIST_TERMS_PER_TENANT)
    );
    expect(messagesDe.SETTINGS.BLOCKLIST_LIMIT_REACHED).toContain(
      String(MAX_BLOCKLIST_TERMS_PER_TENANT)
    );
  });
});
