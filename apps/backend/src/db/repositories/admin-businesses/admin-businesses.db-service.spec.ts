import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { ReviewProviderConnectionStatus } from '@common/enums/review-provider-connection-status.enum';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminBusinessesDbService } from './admin-businesses.db-service';
import { AdminBusinessesRepository, type AdminBusinessRow } from './admin-businesses.repository';

describe('AdminBusinessesDbService', () => {
  let target: AdminBusinessesDbService;
  let adminBusinessesRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    setStatus: jest.Mock;
    count: jest.Mock;
    findRecent: jest.Mock;
  };

  function row(overrides: Partial<AdminBusinessRow> = {}): AdminBusinessRow {
    return {
      id: 'tenant-1',
      name: 'The Coastal Table',
      status: TenantStatus.ACTIVE,
      ownerName: 'Maria Delgado',
      ownerEmail: 'maria@coastaltable.com',
      userCount: 4,
      createdAt: '2025-11-02T09:00:00.000Z',
      latestConnectionStatus: ReviewProviderConnectionStatus.ACTIVE,
      latestConnectionDisconnectedAt: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    adminBusinessesRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      setStatus: jest.fn(),
      count: jest.fn(),
      findRecent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminBusinessesDbService,
        { provide: AdminBusinessesRepository, useValue: adminBusinessesRepository },
      ],
    }).compile();

    target = module.get(AdminBusinessesDbService);
  });

  describe('status mapping', () => {
    it('maps TenantStatus.SUSPENDED to BusinessStatus.SUSPENDED', async () => {
      adminBusinessesRepository.findAll.mockResolvedValue([
        row({ status: TenantStatus.SUSPENDED }),
      ]);

      const [summary] = await target.findAll();

      expect(summary?.status).toBe(BusinessStatus.SUSPENDED);
    });

    it('collapses TenantStatus.PENDING_ACTIVATION into BusinessStatus.ACTIVE', async () => {
      adminBusinessesRepository.findAll.mockResolvedValue([
        row({ status: TenantStatus.PENDING_ACTIVATION }),
      ]);

      const [summary] = await target.findAll();

      expect(summary?.status).toBe(BusinessStatus.ACTIVE);
    });
  });

  describe('connectionStatus derivation', () => {
    /**
     * Distinct from `disconnected` on purpose — a tenant that never onboarded and one whose live
     * connection broke need different people to act. Collapsing them let the newest never-onboarded
     * signups permanently fill the Overview's three "Needs attention" slots, hiding every real
     * mid-life disconnection behind them.
     */
    it('reports never_connected when there is no connection row at all', async () => {
      adminBusinessesRepository.findAll.mockResolvedValue([
        row({ latestConnectionStatus: null, latestConnectionDisconnectedAt: null }),
      ]);

      const [summary] = await target.findAll();

      expect(summary?.connectionStatus).toBe(BusinessConnectionStatus.NEVER_CONNECTED);
    });

    it('reports disconnected when the most recent connection row is disconnected, even if its status is active', async () => {
      adminBusinessesRepository.findAll.mockResolvedValue([
        row({
          latestConnectionStatus: ReviewProviderConnectionStatus.ACTIVE,
          latestConnectionDisconnectedAt: '2026-01-01T00:00:00.000Z',
        }),
      ]);

      const [summary] = await target.findAll();

      expect(summary?.connectionStatus).toBe(BusinessConnectionStatus.DISCONNECTED);
    });

    it('reports needs_reauth when the connection is live but needs reauth', async () => {
      adminBusinessesRepository.findAll.mockResolvedValue([
        row({
          latestConnectionStatus: ReviewProviderConnectionStatus.NEEDS_REAUTH,
          latestConnectionDisconnectedAt: null,
        }),
      ]);

      const [summary] = await target.findAll();

      expect(summary?.connectionStatus).toBe(BusinessConnectionStatus.NEEDS_REAUTH);
    });

    it('reports connected for a live, active, non-disconnected connection', async () => {
      adminBusinessesRepository.findAll.mockResolvedValue([
        row({
          latestConnectionStatus: ReviewProviderConnectionStatus.ACTIVE,
          latestConnectionDisconnectedAt: null,
        }),
      ]);

      const [summary] = await target.findAll();

      expect(summary?.connectionStatus).toBe(BusinessConnectionStatus.CONNECTED);
    });
  });

  it('falls back owner name/email to empty strings rather than null', async () => {
    adminBusinessesRepository.findAll.mockResolvedValue([
      row({ ownerName: null, ownerEmail: null }),
    ]);

    const [summary] = await target.findAll();

    expect(summary?.ownerName).toBe('');
    expect(summary?.ownerEmail).toBe('');
  });

  describe('count', () => {
    it('passes the repository count straight through', async () => {
      adminBusinessesRepository.count.mockResolvedValue(128);

      await expect(target.count()).resolves.toBe(128);
    });
  });

  describe('findRecent', () => {
    it('maps recent rows the same way findAll does, forwarding the limit', async () => {
      adminBusinessesRepository.findRecent.mockResolvedValue([
        row({ status: TenantStatus.SUSPENDED }),
      ]);

      const [summary] = await target.findRecent(5);

      expect(adminBusinessesRepository.findRecent).toHaveBeenCalledWith(5);
      expect(summary?.status).toBe(BusinessStatus.SUSPENDED);
    });
  });

  describe('setStatus', () => {
    it('returns null without re-reading when no tenant matched', async () => {
      adminBusinessesRepository.setStatus.mockResolvedValue(false);

      const result = await target.setStatus({
        tenantId: 'missing',
        status: TenantStatus.SUSPENDED,
      });

      expect(result).toBeNull();
      expect(adminBusinessesRepository.findById).not.toHaveBeenCalled();
    });

    it('re-reads and maps the row after a successful update', async () => {
      adminBusinessesRepository.setStatus.mockResolvedValue(true);
      adminBusinessesRepository.findById.mockResolvedValue(row({ status: TenantStatus.SUSPENDED }));

      const result = await target.setStatus({
        tenantId: 'tenant-1',
        status: TenantStatus.SUSPENDED,
      });

      expect(result?.status).toBe(BusinessStatus.SUSPENDED);
    });
  });
});
