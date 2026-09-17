import { ReviewStatus } from '@common/enums/review-status.enum';
import { Test } from '@nestjs/testing';

import { DashboardDbService } from './dashboard.db-service';
import { DashboardRepository } from './dashboard.repository';

describe('DashboardDbService', () => {
  let target: DashboardDbService;
  let repository: jest.Mocked<DashboardRepository>;

  beforeEach(async () => {
    repository = {
      findActiveLocationIds: jest.fn(),
      getMetrics: jest.fn(),
      getRecentEscalated: jest.fn(),
    } as unknown as jest.Mocked<DashboardRepository>;

    const module = await Test.createTestingModule({
      providers: [DashboardDbService, { provide: DashboardRepository, useValue: repository }],
    }).compile();

    target = module.get(DashboardDbService);
  });

  describe('getMetrics', () => {
    it('resolves every active location when none is named, and passes OPEN_STATUSES through', async () => {
      repository.findActiveLocationIds.mockResolvedValue(['loc-1', 'loc-2']);
      repository.getMetrics.mockResolvedValue({
        total: 10,
        avgRating: 4.2,
        pending: 3,
        escalated: 1,
        ratingCounts: [],
      });

      await target.getMetrics(7, { tenantId: 'tenant-1' });

      expect(repository.findActiveLocationIds).toHaveBeenCalledWith('tenant-1');
      expect(repository.getMetrics).toHaveBeenCalledWith(7, {
        tenantId: 'tenant-1',
        locationIds: ['loc-1', 'loc-2'],
        openStatuses: [ReviewStatus.NEW, ReviewStatus.IN_REVIEW],
      });
    });

    it('scopes to exactly the named location without resolving active locations', async () => {
      repository.getMetrics.mockResolvedValue({
        total: 0,
        avgRating: null,
        pending: 0,
        escalated: 0,
        ratingCounts: [],
      });

      await target.getMetrics(7, { tenantId: 'tenant-1', locationId: 'loc-5' });

      expect(repository.findActiveLocationIds).not.toHaveBeenCalled();
      expect(repository.getMetrics).toHaveBeenCalledWith(7, {
        tenantId: 'tenant-1',
        locationIds: ['loc-5'],
        openStatuses: expect.any(Array),
      });
    });

    /**
     * The regression this guards: the rating chart renders five bars unconditionally, so a bucket
     * with zero reviews still has to come back as `0`, not be absent from the object.
     */
    it('zero-fills every rating 1-5 before overlaying the rows that came back', async () => {
      repository.findActiveLocationIds.mockResolvedValue(['loc-1']);
      repository.getMetrics.mockResolvedValue({
        total: 3,
        avgRating: 4,
        pending: 0,
        escalated: 0,
        ratingCounts: [
          { rating: 5, value: 2 },
          { rating: 3, value: 1 },
        ],
      });

      const result = await target.getMetrics(30, { tenantId: 'tenant-1' });

      expect(result.ratingDistribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 });
    });

    it('returns all-zero metrics for a tenant with no active locations, without erroring', async () => {
      repository.findActiveLocationIds.mockResolvedValue([]);
      repository.getMetrics.mockResolvedValue({
        total: 0,
        avgRating: null,
        pending: 0,
        escalated: 0,
        ratingCounts: [],
      });

      const result = await target.getMetrics(7, { tenantId: 'tenant-1' });

      expect(repository.getMetrics).toHaveBeenCalledWith(7, {
        tenantId: 'tenant-1',
        locationIds: [],
        openStatuses: expect.any(Array),
      });
      expect(result).toEqual({
        total: 0,
        avgRating: null,
        pending: 0,
        escalated: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      });
    });
  });

  describe('getRecentEscalated', () => {
    it('resolves active locations and passes OPEN_STATUSES through', async () => {
      repository.findActiveLocationIds.mockResolvedValue(['loc-1']);
      repository.getRecentEscalated.mockResolvedValue([]);

      await target.getRecentEscalated(5, { tenantId: 'tenant-1' });

      expect(repository.getRecentEscalated).toHaveBeenCalledWith(5, {
        tenantId: 'tenant-1',
        locationIds: ['loc-1'],
        openStatuses: [ReviewStatus.NEW, ReviewStatus.IN_REVIEW],
      });
    });

    it('scopes to exactly the named location without resolving active locations', async () => {
      repository.getRecentEscalated.mockResolvedValue([]);

      await target.getRecentEscalated(5, { tenantId: 'tenant-1', locationId: 'loc-9' });

      expect(repository.findActiveLocationIds).not.toHaveBeenCalled();
      expect(repository.getRecentEscalated).toHaveBeenCalledWith(5, {
        tenantId: 'tenant-1',
        locationIds: ['loc-9'],
        openStatuses: expect.any(Array),
      });
    });
  });
});
