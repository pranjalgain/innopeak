import { Injectable } from '@nestjs/common';

import { DEMO_LOCATIONS, DEMO_REVIEWS_BY_LOCATION_SLUG } from './demo-data.fixtures';
import { DemoDataRepository } from './demo-data.repository';

export interface SeedDemoDataInput {
  tenantId: string;
  userId: string;
  businessName: string;
}

/**
 * Dev-only convenience: populates a brand-new tenant with a fake Google Business Profile
 * connection, two locations, and a handful of varied reviews, so the dashboard and review queue
 * aren't empty the moment a fresh signup lands there — no real Google OAuth involved. Gated by
 * `!isProduction()` at the one call site (`AuthService.verifyEmail`); this class itself has no
 * opinion about environment, matching how `DEV_VERIFY_EMAIL_TOKEN`'s factory does the gating at
 * its own call site rather than inside the provider it selects.
 *
 * Best-effort by design: the caller wraps this in a try/catch and logs rather than fails signup,
 * since losing demo data is cosmetic and losing a real signup over it would not be.
 */
@Injectable()
export class DemoDataDbService {
  constructor(private readonly demoDataRepository: DemoDataRepository) {}

  async seedForTenant(input: SeedDemoDataInput): Promise<void> {
    await this.demoDataRepository.transaction(async tx => {
      const connection = await this.demoDataRepository.insertConnection(tx, {
        tenantId: input.tenantId,
        connectedByUserId: input.userId,
        // Fixed, human-legible literal rather than a random one — uniqueness is scoped to
        // (tenant_id, provider, provider_account_id), and every demo tenant is its own tenant_id.
        providerAccountId: 'accounts/demo-business',
        // Never resolved by `ProviderCredentialService` in practice (see
        // `DemoDataRepository.insertLocation`'s comment) — the literal just needs to satisfy the
        // NOT NULL column and read unambiguously as fake if anyone ever inspects the row.
        credentialReference: 'demo:no-real-credential',
      });

      let activeLocationId: string | null = null;

      for (const locationFixture of DEMO_LOCATIONS) {
        const location = await this.demoDataRepository.insertLocation(tx, {
          tenantId: input.tenantId,
          providerConnectionId: connection.id,
          externalLocationId: `demo-locations/${locationFixture.slug}`,
          name: `${input.businessName} — ${locationFixture.suffix}`,
          address: locationFixture.address,
        });

        await this.demoDataRepository.attachUserToLocation(tx, {
          userId: input.userId,
          locationId: location.id,
        });

        // First location in the list becomes the tenant's initial active pick — the switcher
        // should already have something selected, not force the very first owner to pick one.
        activeLocationId ??= location.id;

        const reviewFixtures = DEMO_REVIEWS_BY_LOCATION_SLUG[locationFixture.slug];
        for (const [index, reviewFixture] of reviewFixtures.entries()) {
          const reviewedAt = new Date(
            Date.now() - reviewFixture.daysAgo * 24 * 60 * 60 * 1000
          ).toISOString();

          await this.demoDataRepository.insertReview(tx, {
            tenantId: input.tenantId,
            locationId: location.id,
            externalReviewId: `demo-${locationFixture.slug}-${index + 1}`,
            externalReviewerId: null,
            rating: reviewFixture.rating,
            reviewText: reviewFixture.reviewText,
            reviewerName: reviewFixture.reviewerName,
            reviewedAt,
            sentiment: reviewFixture.sentiment,
            classification: reviewFixture.classification,
            escalationReason: reviewFixture.escalationReason,
            status: reviewFixture.status,
          });
        }
      }

      if (activeLocationId) {
        await this.demoDataRepository.setActiveLocation(tx, {
          tenantId: input.tenantId,
          locationId: activeLocationId,
        });
      }
    });
  }
}
