import { Test } from '@nestjs/testing';

import { DemoDataDbService } from './demo-data.db-service';
import { DEMO_LOCATIONS, DEMO_REVIEWS_BY_LOCATION_SLUG } from './demo-data.fixtures';
import { DemoDataRepository } from './demo-data.repository';

describe('DemoDataDbService.seedForTenant', () => {
  let service: DemoDataDbService;
  const insertConnection = jest.fn();
  const insertLocation = jest.fn();
  const attachUserToLocation = jest.fn();
  const setActiveLocation = jest.fn();
  const insertReview = jest.fn();

  const txMock = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    insertConnection.mockResolvedValue({ id: 'connection-1' });
    let locationCounter = 0;
    insertLocation.mockImplementation(() => {
      locationCounter += 1;
      return Promise.resolve({ id: `location-${locationCounter}` });
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        DemoDataDbService,
        {
          provide: DemoDataRepository,
          useValue: {
            transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
            insertConnection,
            insertLocation,
            attachUserToLocation,
            setActiveLocation,
            insertReview,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(DemoDataDbService);
  });

  it('creates one connection and one location per fixture, all inside the same transaction', async () => {
    await service.seedForTenant({
      tenantId: 'tenant-1',
      userId: 'user-1',
      businessName: 'The Coffee House',
    });

    expect(insertConnection).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({ tenantId: 'tenant-1', connectedByUserId: 'user-1' })
    );
    expect(insertLocation).toHaveBeenCalledTimes(DEMO_LOCATIONS.length);
    for (const fixture of DEMO_LOCATIONS) {
      expect(insertLocation).toHaveBeenCalledWith(
        txMock,
        expect.objectContaining({
          tenantId: 'tenant-1',
          providerConnectionId: 'connection-1',
          name: `The Coffee House — ${fixture.suffix}`,
        })
      );
    }
  });

  it('attaches the signing-up user to every seeded location', async () => {
    await service.seedForTenant({ tenantId: 'tenant-1', userId: 'user-1', businessName: 'Acme' });

    expect(attachUserToLocation).toHaveBeenCalledTimes(DEMO_LOCATIONS.length);
    expect(attachUserToLocation).toHaveBeenCalledWith(txMock, {
      userId: 'user-1',
      locationId: 'location-1',
    });
    expect(attachUserToLocation).toHaveBeenCalledWith(txMock, {
      userId: 'user-1',
      locationId: 'location-2',
    });
  });

  it("sets the tenant's active location to the first seeded location, not the last", async () => {
    await service.seedForTenant({ tenantId: 'tenant-1', userId: 'user-1', businessName: 'Acme' });

    expect(setActiveLocation).toHaveBeenCalledWith(txMock, {
      tenantId: 'tenant-1',
      locationId: 'location-1',
    });
  });

  it("inserts every fixture review for every location, tagged with that location's id", async () => {
    const totalReviews = Object.values(DEMO_REVIEWS_BY_LOCATION_SLUG).reduce(
      (sum, reviews) => sum + reviews.length,
      0
    );

    await service.seedForTenant({ tenantId: 'tenant-1', userId: 'user-1', businessName: 'Acme' });

    expect(insertReview).toHaveBeenCalledTimes(totalReviews);
    const downtownReviews = DEMO_REVIEWS_BY_LOCATION_SLUG['downtown'];
    expect(insertReview).toHaveBeenCalledWith(
      txMock,
      expect.objectContaining({
        tenantId: 'tenant-1',
        locationId: 'location-1',
        rating: downtownReviews[0]?.rating,
        classification: downtownReviews[0]?.classification,
      })
    );
  });

  it('gives every review a unique externalReviewId per location, satisfying the unique index', async () => {
    await service.seedForTenant({ tenantId: 'tenant-1', userId: 'user-1', businessName: 'Acme' });

    const externalReviewIds = insertReview.mock.calls.map(
      ([, input]: [unknown, { externalReviewId: string }]) => input.externalReviewId
    );
    expect(new Set(externalReviewIds).size).toBe(externalReviewIds.length);
  });
});
