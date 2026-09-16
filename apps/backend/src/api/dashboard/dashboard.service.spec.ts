import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth-user.type';
import { DashboardRepository } from '@db/repositories/dashboard/dashboard.repository';
import { Test } from '@nestjs/testing';

import { DashboardService } from './dashboard.service';

const user: TenantAuthUser = {
  type: JwtTokenType.TENANT_USER,
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'owner@example.com',
  role: UserRole.OWNER,
  locale: null,
};

describe('DashboardService — locationId threading', () => {
  let service: DashboardService;
  const getMetrics = jest.fn();
  const getRecentEscalated = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    getMetrics.mockResolvedValue({
      total: 0,
      avgRating: null,
      pending: 0,
      escalated: 0,
      ratingDistribution: {},
    });
    getRecentEscalated.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DashboardRepository, useValue: { getMetrics, getRecentEscalated } },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  it('passes a given locationId through to the repository', async () => {
    await service.getMetrics(7, user, 'location-1');

    expect(getMetrics).toHaveBeenCalledWith(7, 'tenant-1', 'location-1');
  });

  it('passes undefined through when no location is selected, aggregating every location', async () => {
    await service.getMetrics(7, user);

    expect(getMetrics).toHaveBeenCalledWith(7, 'tenant-1', undefined);
  });

  it('threads locationId through getRecentEscalated the same way', async () => {
    await service.getRecentEscalated(4, user, 'location-1');
    expect(getRecentEscalated).toHaveBeenCalledWith(4, 'tenant-1', 'location-1');

    await service.getRecentEscalated(4, user);
    expect(getRecentEscalated).toHaveBeenCalledWith(4, 'tenant-1', undefined);
  });

  it('never lets a locationId call reach the repository under another tenant — tenantId always comes from the token, not the caller', async () => {
    await service.getMetrics(30, user, 'location-owned-by-someone-else');

    // The service has no way to pass a caller-supplied tenantId at all — `tenantUser.tenantId`
    // (from the verified JWT) is the only tenantId argument the repository call can ever see.
    expect(getMetrics).toHaveBeenCalledWith(30, user.tenantId, 'location-owned-by-someone-else');
  });
});
