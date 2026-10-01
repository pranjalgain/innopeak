import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import type { TenantAuthUser } from '@auth/types/auth.type';
import { DashboardDbService } from '@db/repositories/dashboard/dashboard.db-service';
import { Test } from '@nestjs/testing';

import { DashboardService } from './dashboard.service';
import type { DashboardWindowQueryDto, RecentEscalatedQueryDto } from './dto/dashboard-request.dto';

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
        { provide: DashboardDbService, useValue: { getMetrics, getRecentEscalated } },
      ],
    }).compile();

    service = moduleRef.get(DashboardService);
  });

  it('passes a given locationId through to the repository', async () => {
    const query: DashboardWindowQueryDto = { days: 7, locationId: 'location-1' };
    await service.getMetrics(user, query);

    expect(getMetrics).toHaveBeenCalledWith(7, { tenantId: 'tenant-1', locationId: 'location-1' });
  });

  it('passes undefined through when no location is selected, aggregating every location', async () => {
    const query: DashboardWindowQueryDto = { days: 7 };
    await service.getMetrics(user, query);

    expect(getMetrics).toHaveBeenCalledWith(7, { tenantId: 'tenant-1', locationId: undefined });
  });

  it('threads locationId through getRecentEscalated the same way', async () => {
    const withLocation: RecentEscalatedQueryDto = { limit: 4, locationId: 'location-1' };
    await service.getRecentEscalated(user, withLocation);
    expect(getRecentEscalated).toHaveBeenCalledWith(4, {
      tenantId: 'tenant-1',
      locationId: 'location-1',
    });

    const withoutLocation: RecentEscalatedQueryDto = { limit: 4 };
    await service.getRecentEscalated(user, withoutLocation);
    expect(getRecentEscalated).toHaveBeenCalledWith(4, {
      tenantId: 'tenant-1',
      locationId: undefined,
    });
  });

  it('never lets a locationId call reach the repository under another tenant — tenantId always comes from the token, not the caller', async () => {
    const query: DashboardWindowQueryDto = {
      days: 30,
      locationId: 'location-owned-by-someone-else',
    };
    await service.getMetrics(user, query);

    // The service has no way to pass a caller-supplied tenantId at all — `tenantUser.tenantId`
    // (from the verified JWT) is the only tenantId argument the repository call can ever see.
    expect(getMetrics).toHaveBeenCalledWith(30, {
      tenantId: user.tenantId,
      locationId: 'location-owned-by-someone-else',
    });
  });
});
