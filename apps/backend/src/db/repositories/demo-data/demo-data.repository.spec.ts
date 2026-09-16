import { LocationStatus } from '@common/enums/location-status.enum';
import { DBService } from '@db/db.service';
import { Test } from '@nestjs/testing';

import { DemoDataRepository } from './demo-data.repository';

/**
 * The one property of the seeded rows that is load-bearing beyond "some data exists".
 *
 * Regression: these locations were originally inserted with a NULL `onboardingBackfillCompletedAt`
 * to keep them outside `CronService.pollDueLocations`'s reach (that query requires the column to be
 * non-null). But the same column is what the onboarding flow reads as "this location finished
 * importing" — `ConnectionsSyncService` reports `livePollingEnabled: onboardingBackfillCompletedAt
 * !== null`, and `useOnboardingConnectFlow` advances to "done" only on that flag. A fresh signup
 * redirected to /onboarding/connect therefore sat on "Importing your review history…" permanently:
 * no progress, no error, and no give-up either (a location with no `sync_runs` row never reports
 * `isStale`, so the 10-minute abandon timer never armed).
 */
describe('DemoDataRepository.insertLocation', () => {
  let repository: DemoDataRepository;
  const values = jest.fn();

  /** Minimal chainable stand-in for Drizzle's insert builder. */
  const tx = {
    insert: () => ({
      values: (payload: Record<string, unknown>) => {
        values(payload);
        return { returning: () => Promise.resolve([{ id: 'location-1' }]) };
      },
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      providers: [DemoDataRepository, { provide: DBService, useValue: {} }],
    }).compile();

    repository = moduleRef.get(DemoDataRepository);
  });

  async function insert(): Promise<Record<string, unknown>> {
    await repository.insertLocation(tx as never, {
      tenantId: 'tenant-1',
      providerConnectionId: 'connection-1',
      externalLocationId: 'demo-locations/downtown',
      name: 'Acme — Downtown',
      address: '1 Main St',
    });
    return values.mock.calls[0]?.[0] as Record<string, unknown>;
  }

  it('stamps onboardingBackfillCompletedAt so onboarding does not treat the location as still importing', async () => {
    const payload = await insert();

    expect(payload['onboardingBackfillCompletedAt']).toBeDefined();
    expect(payload['onboardingBackfillCompletedAt']).not.toBeNull();
  });

  it('inserts the location active, so it counts as a connected business', async () => {
    const payload = await insert();

    expect(payload['status']).toBe(LocationStatus.ACTIVE);
    expect(payload['tenantId']).toBe('tenant-1');
    expect(payload['providerConnectionId']).toBe('connection-1');
  });
});
