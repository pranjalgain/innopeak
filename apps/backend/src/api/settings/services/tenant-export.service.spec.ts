import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import type { AuthUser } from '@auth/types/auth.type';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { TenantExportDbService } from '@db/repositories/tenant-export/tenant-export.db-service';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { TenantExportService } from './tenant-export.service';

import { EXPORT_REVIEW_BATCH_SIZE } from '../constants/tenant-export.constants';

async function read(stream: NodeJS.ReadableStream): Promise<string> {
  let out = '';
  for await (const chunk of stream) {
    out += String(chunk);
  }
  return out;
}

describe('TenantExportService', () => {
  let target: TenantExportService;
  let exportDb: { getSections: jest.Mock; getReviewBatch: jest.Mock };
  let authDb: { findTenantStatus: jest.Mock; findUserById: jest.Mock };

  const owner: AuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'jane@acme.test',
    role: UserRole.OWNER,
    locale: null,
  };
  const sections = {
    business: { name: 'Acme Dental', status: 'active', createdAt: '2026-03-02T10:00:00.000Z' },
    team: [
      { name: 'Jane', email: 'jane@acme.test', role: 'owner', status: 'active', createdAt: 'x' },
    ],
    settings: {
      escalationRatingThreshold: 3,
      autoPostEnabled: false,
      reviewDataRetentionMonths: null,
      aiReplyCount: 1,
    },
    blocklist: ['refund'],
    notificationRecipients: [],
    locations: [],
    prompts: [],
    billing: { plan: 'free', status: null, currentPeriodEnd: null, receipts: [] },
  };
  const review = (id: string): Record<string, unknown> => ({ id, rating: 5, responses: [] });

  beforeEach(async () => {
    exportDb = {
      getSections: jest.fn().mockResolvedValue(sections),
      getReviewBatch: jest.fn().mockResolvedValue({ reviews: [] }),
    };
    authDb = {
      findTenantStatus: jest.fn().mockResolvedValue({ status: TenantStatus.ACTIVE, name: 'Acme' }),
      findUserById: jest.fn().mockResolvedValue({ id: 'user-1', status: UserStatus.ACTIVE }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantExportService,
        { provide: TenantExportDbService, useValue: exportDb },
        { provide: AuthDbService, useValue: authDb },
      ],
    }).compile();
    target = moduleRef.get(TenantExportService);
  });

  it('produces one valid JSON document, with an empty review list when there are none', async () => {
    const { stream, filename } = await target.exportData(owner);
    const doc = JSON.parse(await read(stream)) as Record<string, unknown>;

    expect(doc).toMatchObject({
      format: 'innopeak-export',
      version: 1,
      business: { name: 'Acme Dental' },
      blocklist: ['refund'],
      reviews: [],
      billing: { plan: 'free' },
    });
    expect(filename).toMatch(/^innopeak-export-acme-dental-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('streams reviews batch by batch with correct commas across the batch boundary', async () => {
    const full = Array.from({ length: EXPORT_REVIEW_BATCH_SIZE }, (_, i) => review(`r${i}`));
    exportDb.getReviewBatch
      .mockResolvedValueOnce({ reviews: full })
      .mockResolvedValueOnce({ reviews: [review('last')] });

    const { stream } = await target.exportData(owner);
    const doc = JSON.parse(await read(stream)) as { reviews: Array<{ id: string }> };

    expect(doc.reviews).toHaveLength(EXPORT_REVIEW_BATCH_SIZE + 1);
    expect(doc.reviews[0]?.id).toBe('r0');
    expect(doc.reviews.at(-1)?.id).toBe('last');
    // The second page continues from the last id of the first.
    expect(exportDb.getReviewBatch).toHaveBeenNthCalledWith(2, {
      tenantId: 'tenant-1',
      afterId: `r${EXPORT_REVIEW_BATCH_SIZE - 1}`,
      limit: EXPORT_REVIEW_BATCH_SIZE,
    });
  });

  it('stops after a short page rather than asking for another', async () => {
    exportDb.getReviewBatch.mockResolvedValue({ reviews: [review('a'), review('b')] });

    const { stream } = await target.exportData(owner);
    await read(stream);

    expect(exportDb.getReviewBatch).toHaveBeenCalledTimes(1);
  });

  it('reads nothing from the database until the stream is consumed', async () => {
    const { stream } = await target.exportData(owner);

    expect(exportDb.getReviewBatch).not.toHaveBeenCalled();
    stream.destroy();
  });

  it('refuses a suspended business, even to a still-valid access token', async () => {
    authDb.findTenantStatus.mockResolvedValue({ status: TenantStatus.SUSPENDED, name: 'Acme' });

    await expect(target.exportData(owner)).rejects.toMatchObject({
      response: { code: 'TENANT_SUSPENDED' },
    });
    expect(exportDb.getSections).not.toHaveBeenCalled();
  });

  it('refuses a user an admin has disabled, even with a still-valid token', async () => {
    authDb.findUserById.mockResolvedValue({ id: 'user-1', status: UserStatus.DISABLED });

    await expect(target.exportData(owner)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DISABLED' },
    });
    expect(exportDb.getSections).not.toHaveBeenCalled();
  });

  it('refuses a platform-admin token', async () => {
    const admin = {
      type: JwtTokenType.PLATFORM_ADMIN,
      id: 'a',
      email: 'a@b.c',
      locale: null,
    } as AuthUser;

    await expect(target.exportData(admin)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
