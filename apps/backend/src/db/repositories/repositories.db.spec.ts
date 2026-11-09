import { SsoProvider } from '@auth/constants/sso-auth.constants';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { AdminBillingRepository } from './admin-billing/admin-billing.repository';
import { AdminBusinessesRepository } from './admin-businesses/admin-businesses.repository';
import { AdminOverviewDbService } from './admin-overview/admin-overview.db-service';
import { AdminOverviewRepository } from './admin-overview/admin-overview.repository';
import { AdminUsersRepository } from './admin-users/admin-users.repository';
import { AuthDbService } from './auth/auth.db-service';
import { AuthRepository } from './auth/auth.repository';
import { BillingPlansRepository } from './billing/billing-plans.repository';
import { BillingReceiptsRepository } from './billing/billing-receipts.repository';
import { StripeWebhookEventsRepository } from './billing/stripe-webhook-events.repository';
import { TenantSubscriptionsDbService } from './billing/tenant-subscriptions.db-service';
import { TenantSubscriptionsRepository } from './billing/tenant-subscriptions.repository';
import { ConnectionsRepository } from './connections/connections.repository';
import { NotificationsRepository } from './notifications/notifications.repository';
import { PlatformAdminRepository } from './platform-admin/platform-admin.repository';
import { PlatformSettingsRepository } from './platform-settings/platform-settings.repository';
import { PromptsDbService } from './prompts/prompts.db-service';
import { PromptsRepository } from './prompts/prompts.repository';
import { ReviewSyncRepository } from './review-sync/review-sync.repository';
import { ReviewsReadRepository } from './review-sync/reviews-read.repository';
import { BlocklistTermsRepository } from './settings/blocklist-terms.repository';
import { TenantExportRepository } from './tenant-export/tenant-export.repository';

import { deterministicUuid } from '../../api/notifications/utils/deterministic-uuid.util';

/**
 * Opt-in: runs only when `TEST_DATABASE_URL` points at a migrated, DISPOSABLE Postgres (e.g.
 * `createdb innopeak_test && POSTGRES_DB=innopeak_test pnpm db:migrate`). Each test creates and
 * deletes its own tenant, so never point it at a database holding real data.
 */
const url = process.env['TEST_DATABASE_URL'];
const describeWithDb = url ? describe : describe.skip;

describeWithDb('repositories against a real database', () => {
  let pool: Pool;
  let dbService: DBService;
  const tenants: string[] = [];
  const platformAdmins: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: url, max: 20 });
    dbService = { db: drizzle(pool, { schema }), pool } as unknown as DBService;
  });

  afterAll(async () => {
    await pool.end();
  });

  afterEach(async () => {
    if (tenants.length > 0) {
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [tenants.splice(0)]);
    }
    if (platformAdmins.length > 0) {
      await pool.query('DELETE FROM platform_admins WHERE id = ANY($1::uuid[])', [
        platformAdmins.splice(0),
      ]);
    }
  });

  // A freshly migrated database has no platform admin (the root admin comes from seeding), so make one when there is none.
  async function anyPlatformAdmin(): Promise<string> {
    const { rows: existing } = await pool.query<{ id: string }>(
      `SELECT id FROM platform_admins LIMIT 1`
    );
    if (existing[0]) {
      return existing[0].id;
    }
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO platform_admins (email, status) VALUES ($1, 'active') RETURNING id`,
      [`db-spec-${Math.random().toString(36).slice(2)}@example.test`]
    );
    const id = rows[0]?.id as string;
    platformAdmins.push(id);
    return id;
  }

  async function newTenant(status = 'active'): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO tenants (name, status) VALUES ($1, $2::tenant_status) RETURNING id`,
      [`db-spec ${Math.random().toString(36).slice(2)}`, status]
    );
    const id = rows[0]?.id as string;
    tenants.push(id);
    return id;
  }

  async function newUser(tenantId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, name, role, status)
       VALUES ($1, $2, 'Spec User', 'owner', 'active') RETURNING id`,
      [tenantId, `spec-${Math.random().toString(36).slice(2)}@example.test`]
    );
    return rows[0]?.id as string;
  }

  async function newLocation(tenantId: string): Promise<string> {
    const userId = await newUser(tenantId);
    const conn = await pool.query<{ id: string }>(
      `INSERT INTO review_provider_connections
         (tenant_id, connected_by_user_id, provider_account_id, credential_reference)
       VALUES ($1, $2, 'accounts/1', 'ref') RETURNING id`,
      [tenantId, userId]
    );
    const loc = await pool.query<{ id: string }>(
      `INSERT INTO locations
         (tenant_id, provider_connection_id, external_location_id, name, onboarding_backfill_completed_at)
       VALUES ($1, $2, 'locations/1', 'Spec Location', now()) RETURNING id`,
      [tenantId, conn.rows[0]?.id]
    );
    return loc.rows[0]?.id as string;
  }

  describe('BlocklistTermsRepository.insertTerm', () => {
    it('stops at the cap, reports a duplicate before the limit, and frees a slot on delete', async () => {
      const repo = new BlocklistTermsRepository(dbService);
      const tenantId = await newTenant();

      for (let i = 0; i < 3; i++) {
        const result = await repo.insertTerm({ tenantId, term: `term-${i}`, maxTerms: 3 });
        expect(result.outcome).toBe('created');
      }

      expect((await repo.insertTerm({ tenantId, term: 'one more', maxTerms: 3 })).outcome).toBe(
        'limit_reached'
      );
      expect((await repo.insertTerm({ tenantId, term: 'TERM-1', maxTerms: 3 })).outcome).toBe(
        'duplicate'
      );
    });

    it('never stores more than the cap when adds race', async () => {
      const repo = new BlocklistTermsRepository(dbService);
      const tenantId = await newTenant();

      const results = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          repo.insertTerm({ tenantId, term: `race-${i}`, maxTerms: 10 })
        )
      );

      const stored = await pool.query(
        'SELECT count(*)::int AS n FROM blocklist_terms WHERE tenant_id = $1',
        [tenantId]
      );
      expect(stored.rows[0].n).toBe(10);
      expect(results.filter(r => r.outcome === 'created')).toHaveLength(10);
      expect(results.filter(r => r.outcome === 'limit_reached')).toHaveLength(15);
    });
  });

  describe('NotificationsRepository', () => {
    async function userWith(
      tenantId: string,
      status: string,
      extra: { anonymized?: boolean; erasure?: boolean } = {}
    ): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, name, role, status, anonymized_at, erasure_requested_at)
         VALUES ($1, $2, 'Spec User', 'member', $3::user_status,
                 CASE WHEN $4 THEN now() END, CASE WHEN $5 THEN now() END) RETURNING id`,
        [
          tenantId,
          `spec-${Math.random().toString(36).slice(2)}@example.test`,
          status,
          extra.anonymized ?? false,
          extra.erasure ?? false,
        ]
      );
      return rows[0]?.id as string;
    }

    it('lists only active, non-anonymized users with no erasure pending', async () => {
      const repository = new NotificationsRepository(dbService);
      const tenantId = await newTenant();
      const active = await userWith(tenantId, 'active');
      await userWith(tenantId, 'disabled');
      await userWith(tenantId, 'invited');
      await userWith(tenantId, 'active', { anonymized: true });
      await userWith(tenantId, 'active', { erasure: true });
      const otherTenant = await newTenant();
      await userWith(otherTenant, 'active');

      const recipients = await repository.listActiveRecipients(tenantId);

      expect(recipients.map(recipient => recipient.id)).toEqual([active]);
    });

    it('writes each notice once: a repeat for the same review and generation group is a no-op', async () => {
      const repository = new NotificationsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await userWith(tenantId, 'active');
      const locationId = await newLocation(tenantId);
      const { rows: reviewRows } = await pool.query<{ id: string }>(
        `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating)
         VALUES ($1, $2, 'ext-1', 1) RETURNING id`,
        [tenantId, locationId]
      );
      const reviewId = reviewRows[0]?.id as string;
      const groupId = '0190c1a0-0000-7000-8000-000000000001';
      const notice = {
        tenantId,
        userId,
        type: 'reply_needs_approval',
        title: 'Reply ready for approval',
        description: 'A drafted reply is waiting.',
        reviewId,
        generationGroupId: groupId,
      };

      const first = await repository.insertMany([notice]);
      expect(first).toEqual([{ id: expect.any(String), userId }]);
      expect(await repository.insertMany([notice])).toEqual([]);
      expect(await repository.insertMany([])).toEqual([]);
    });

    it('writes an escalation once per review even when the same review is announced again', async () => {
      const repository = new NotificationsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await userWith(tenantId, 'active');
      const locationId = await newLocation(tenantId);
      const { rows: reviewRows } = await pool.query<{ id: string }>(
        `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating)
         VALUES ($1, $2, 'ext-esc', 1) RETURNING id`,
        [tenantId, locationId]
      );
      const notice = {
        tenantId,
        userId,
        type: 'review_escalated',
        title: 'Review escalated',
        description: null,
        reviewId: reviewRows[0]?.id as string,
        generationGroupId: deterministicUuid(`review-escalated:${reviewRows[0]?.id}`),
      };

      expect(await repository.insertMany([notice])).toHaveLength(1);
      expect(await repository.insertMany([notice])).toEqual([]);
    });

    it('writes nothing when a later chunk fails, so a notice is never half written', async () => {
      const repository = new NotificationsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await userWith(tenantId, 'active');
      const good = (n: number) => ({
        tenantId,
        userId,
        type: 'connection_issue',
        title: `t${n}`,
        description: null,
        reviewId: null,
        generationGroupId: null,
      });
      // 600 rows span two chunks; the very last one points at a user that does not exist, which fails the second chunk.
      const rows = [
        ...Array.from({ length: 599 }, (_, n) => good(n)),
        { ...good(599), userId: '0190c1a0-0000-7000-8000-00000000dead' },
      ];

      await expect(repository.insertMany(rows)).rejects.toThrow();

      const { rows: left } = await pool.query(
        `SELECT 1 FROM in_app_notifications WHERE tenant_id = $1`,
        [tenantId]
      );
      expect(left).toHaveLength(0);
    });

    it('keeps each connection incident as its own notice (no review, so nothing to dedupe on)', async () => {
      const repository = new NotificationsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await userWith(tenantId, 'active');
      const notice = {
        tenantId,
        userId,
        type: 'connection_issue',
        title: 'Google connection needs attention',
        description: null,
        reviewId: null,
        generationGroupId: null,
      };

      expect(await repository.insertMany([notice])).toHaveLength(1);
      expect(await repository.insertMany([notice])).toHaveLength(1);
    });

    it('purges read notices past their retention and any notice past the longer one, keeping the rest', async () => {
      const repository = new NotificationsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await userWith(tenantId, 'active');
      const insert = async (readDaysAgo: number | null, createdDaysAgo: number): Promise<void> => {
        await pool.query(
          `INSERT INTO in_app_notifications (tenant_id, user_id, type, title, read_at, created_at)
           VALUES ($1, $2, 'connection_issue', 't',
                   CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(days => $3::int) END,
                   now() - make_interval(days => $4::int))`,
          [tenantId, userId, readDaysAgo, createdDaysAgo]
        );
      };
      await insert(100, 120); // read long ago: purged
      await insert(10, 120); // read recently, old row: kept (read retention counts from reading)
      await insert(null, 200); // unread and older than the long retention: purged
      await insert(null, 100); // unread, within retention: kept
      await insert(1, 2); // fresh: kept

      const purged = await repository.purgeOld({ readRetentionDays: 90, unreadRetentionDays: 180 });
      const { rows } = await pool.query(`SELECT 1 FROM in_app_notifications WHERE tenant_id = $1`, [
        tenantId,
      ]);

      expect(purged).toBe(2);
      expect(rows).toHaveLength(3);
    });

    it('purges across several batches until nothing expired is left', async () => {
      const repository = new NotificationsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await userWith(tenantId, 'active');
      for (let i = 0; i < 5; i += 1) {
        await pool.query(
          `INSERT INTO in_app_notifications (tenant_id, user_id, type, title, created_at)
           VALUES ($1, $2, 'connection_issue', 't', now() - interval '400 days')`,
          [tenantId, userId]
        );
      }
      await pool.query(
        `INSERT INTO in_app_notifications (tenant_id, user_id, type, title) VALUES ($1, $2, 'connection_issue', 't')`,
        [tenantId, userId]
      );

      const purged = await repository.purgeOld({
        readRetentionDays: 90,
        unreadRetentionDays: 180,
        batchSize: 2,
      });
      const { rows } = await pool.query(`SELECT 1 FROM in_app_notifications WHERE tenant_id = $1`, [
        tenantId,
      ]);

      expect(purged).toBe(5);
      expect(rows).toHaveLength(1);
    });
  });

  describe('PlatformSettingsRepository.countActiveSsoOnlyTenantUsers', () => {
    it('counts only active, password-less users whose only identity is that provider', async () => {
      const repository = new PlatformSettingsRepository(dbService);
      const before = await repository.countActiveSsoOnlyTenantUsers(UserIdentityProvider.GOOGLE);
      const tenantId = await newTenant();
      const make = async (opts: {
        status?: string;
        password?: boolean;
        anonymized?: boolean;
        identities: string[];
      }): Promise<void> => {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, name, role, status, password_hash, anonymized_at)
           VALUES ($1, $2, 'Spec User', 'member', $3::user_status, $4, CASE WHEN $5 THEN now() END) RETURNING id`,
          [
            tenantId,
            `spec-${Math.random().toString(36).slice(2)}@example.test`,
            opts.status ?? 'active',
            opts.password ? 'hash' : null,
            opts.anonymized ?? false,
          ]
        );
        for (const provider of opts.identities) {
          await pool.query(
            `INSERT INTO user_identities (user_id, provider, provider_user_id, email)
             VALUES ($1, $2::user_identity_provider, $3, 'x@example.test')`,
            [rows[0]?.id, provider, `sub-${Math.random().toString(36).slice(2)}`]
          );
        }
      };

      await make({ identities: ['google'] }); // counted
      await make({ identities: ['google'], password: true }); // can use a password
      await make({ identities: ['google', 'entra_id'] }); // can use Microsoft
      await make({ identities: ['google'], status: 'disabled' }); // cannot sign in anyway
      await make({ identities: ['google'], anonymized: true }); // erased
      await make({ identities: ['entra_id'] }); // a different provider

      expect(await repository.countActiveSsoOnlyTenantUsers(UserIdentityProvider.GOOGLE)).toBe(
        before + 1
      );
    });
  });

  describe('ConnectionsRepository.markNeedsReauth', () => {
    it('reports true only for the call that moved the connection into needs_reauth', async () => {
      const repository = new ConnectionsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await newUser(tenantId);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO review_provider_connections
           (tenant_id, connected_by_user_id, provider_account_id, credential_reference)
         VALUES ($1, $2, 'accounts/1', 'ref') RETURNING id`,
        [tenantId, userId]
      );
      const connectionId = rows[0]?.id as string;

      expect(await repository.markNeedsReauth(connectionId)).toBe(true);
      expect(await repository.markNeedsReauth(connectionId)).toBe(false);
      expect(await repository.markNeedsReauth('0190c1a0-0000-7000-8000-00000000ffff')).toBe(false);
    });
  });

  describe('ConnectionsRepository.updateLocationRating', () => {
    const read = async (locationId: string) =>
      (
        await pool.query(
          `SELECT google_rating::float AS rating, google_review_count AS count, updated_at FROM locations WHERE id = $1`,
          [locationId]
        )
      ).rows[0] as { rating: number | null; count: number | null; updated_at: Date };

    it("stores Google's rating and review count, and keeps what it has when a page sends only one", async () => {
      const repository = new ConnectionsRepository(dbService);
      const locationId = await newLocation(await newTenant());

      await repository.updateLocationRating({ locationId, rating: 4.3, reviewCount: 212 });
      expect(await read(locationId)).toMatchObject({ rating: 4.3, count: 212 });

      await repository.updateLocationRating({ locationId, rating: null, reviewCount: 230 });
      expect(await read(locationId)).toMatchObject({ rating: 4.3, count: 230 });

      await repository.updateLocationRating({ locationId, rating: 4.25, reviewCount: null });
      expect(await read(locationId)).toMatchObject({ rating: 4.25, count: 230 });
    });

    // A poll runs every 15 minutes and usually finds the same figures: that must cost no write and no updated_at churn.
    it('writes nothing when the figures are unchanged', async () => {
      const repository = new ConnectionsRepository(dbService);
      const locationId = await newLocation(await newTenant());
      await repository.updateLocationRating({ locationId, rating: 4.3, reviewCount: 212 });
      const before = await read(locationId);

      await repository.updateLocationRating({ locationId, rating: 4.3, reviewCount: 212 });

      expect((await read(locationId)).updated_at).toEqual(before.updated_at);
    });

    it('ignores a call with neither figure', async () => {
      const repository = new ConnectionsRepository(dbService);
      const locationId = await newLocation(await newTenant());

      await expect(
        repository.updateLocationRating({ locationId, rating: null, reviewCount: null })
      ).resolves.toBeUndefined();
      expect(await read(locationId)).toMatchObject({ rating: null, count: null });
    });
  });

  describe('notification recipients', () => {
    // A repeated provisioning used to add a second row, which the recipients list then showed twice.
    it('seeds a person once, however many times it is asked', async () => {
      const tenantId = await newTenant('active');
      const userId = await newUser(tenantId);
      const repo = new AuthRepository(dbService);

      await dbService.db.transaction(async tx => {
        await repo.insertNotificationRecipient(tx, { tenantId, userId });
        await repo.insertNotificationRecipient(tx, { tenantId, userId });
      });

      const { rows } = await pool.query<{ n: string }>(
        `SELECT count(*) n FROM notification_recipients WHERE user_id = $1`,
        [userId]
      );
      expect(Number(rows[0]?.n)).toBe(1);
    });
  });

  describe('ConnectionsRepository.findLocationsForUser', () => {
    // Only the owner who confirms a location is attached in `user_locations`; an invited member never is.
    it("lists the business's locations for a member who was never attached, and nobody else's", async () => {
      const repo = new ConnectionsRepository(dbService);
      const tenantId = await newTenant('active');
      const other = await newTenant('active');
      const member = await newUser(tenantId);
      const mine = await newLocation(tenantId);
      await newLocation(other);

      const found = await repo.findLocationsForUser(member);

      expect(found.map(row => row.id)).toEqual([mine]);
    });
  });

  describe('a location that is billing-paused', () => {
    async function seedReview(
      tenantId: string,
      locationId: string,
      status = 'new'
    ): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO reviews (tenant_id, location_id, external_review_id, reviewer_name, review_text, rating, status)
         VALUES ($1, $2, $3, 'Jane', 'Nice', 5, $4::review_status) RETURNING id`,
        [tenantId, locationId, `r-${Math.random().toString(36).slice(2)}`, status]
      );
      return rows[0]?.id as string;
    }

    // Reads hide a paused location's reviews; the reply actions ask for them (`includePaused`) so they can say "location paused".
    it('hides its review from a read, but a reply action can still reach it', async () => {
      const tenantId = await newTenant('active');
      const locationId = await newLocation(tenantId);
      const reviewId = await seedReview(tenantId, locationId);
      await pool.query(`UPDATE locations SET billing_paused_at = now() WHERE id = $1`, [
        locationId,
      ]);
      const repo = new ReviewsReadRepository(dbService);

      expect(await repo.findReviewByIdForTenant({ reviewId, tenantId })).toBeNull();
      expect(
        (await repo.findReviewByIdForTenant({ reviewId, tenantId, includePaused: true }))?.id
      ).toBe(reviewId);
    });

    it('is no longer polled once paused, and is polled again when it is not', async () => {
      const tenantId = await newTenant('active');
      const locationId = await newLocation(tenantId);
      const repo = new ConnectionsRepository(dbService);

      expect(await repo.isLocationPollable(locationId, tenantId)).toBe(true);
      await pool.query(`UPDATE locations SET billing_paused_at = now() WHERE id = $1`, [
        locationId,
      ]);
      expect(await repo.isLocationPollable(locationId, tenantId)).toBe(false);
      // Another tenant's id never matches.
      expect(await repo.isLocationPollable(locationId, await newTenant('active'))).toBe(false);
    });

    it('is not polled for a suspended business either', async () => {
      const tenantId = await newTenant('suspended');
      const locationId = await newLocation(tenantId);

      expect(
        await new ConnectionsRepository(dbService).isLocationPollable(locationId, tenantId)
      ).toBe(false);
    });

    // An outage of the AI provider says nothing about the review: it must not use up the review's attempts.
    it('releases a claim without counting an attempt when asked not to', async () => {
      const tenantId = await newTenant('active');
      const locationId = await newLocation(tenantId);
      const repo = new ReviewSyncRepository(dbService);
      const counted = await seedReview(tenantId, locationId, 'in_review');
      const uncounted = await seedReview(tenantId, locationId, 'in_review');
      const read = async (id: string) =>
        (
          await pool.query(
            `SELECT status, generation_attempts, generation_failed_at FROM reviews WHERE id = $1`,
            [id]
          )
        ).rows[0];

      await repo.releaseGenerationClaimAfterFailure(counted);
      await repo.releaseGenerationClaimAfterFailure(uncounted, false);

      expect(await read(counted)).toMatchObject({ status: 'new', generation_attempts: 1 });
      expect((await read(counted)).generation_failed_at).not.toBeNull();
      expect(await read(uncounted)).toMatchObject({
        status: 'new',
        generation_attempts: 0,
        generation_failed_at: null,
      });
    });
  });

  describe('ConnectionsRepository.findLocationsDueForPoll', () => {
    it('polls an active tenant but not a suspended or erased one', async () => {
      const repo = new ConnectionsRepository(dbService);
      const active = await newTenant('active');
      const suspended = await newTenant('suspended');
      const erased = await newTenant('erased');
      for (const id of [active, suspended, erased]) await newLocation(id);

      const due = (await repo.findLocationsDueForPoll()).map(row => row.tenantId);

      expect(due).toContain(active);
      expect(due).not.toContain(suspended);
      expect(due).not.toContain(erased);
    });
  });

  describe('ReviewSyncRepository', () => {
    async function newReview(tenantId: string, locationId: string, ext: string): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO reviews (tenant_id, location_id, external_review_id, reviewer_name, external_reviewer_id, rating)
         VALUES ($1, $2, $3, 'Real Person', 'ext-1', 5) RETURNING id`,
        [tenantId, locationId, ext]
      );
      return rows[0]?.id as string;
    }

    it('anonymizes reviewer PII for one tenant only, and only once', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const mine = await newTenant();
      const other = await newTenant();
      const myReview = await newReview(mine, await newLocation(mine), 'r1');
      const otherReview = await newReview(other, await newLocation(other), 'r1');

      expect(await repo.anonymizeReviewerPiiForTenant(mine)).toBe(1);
      expect(await repo.anonymizeReviewerPiiForTenant(mine)).toBe(0);

      const rows = await pool.query(
        'SELECT id, reviewer_name, external_reviewer_id, anonymized_at FROM reviews WHERE id = ANY($1::uuid[])',
        [[myReview, otherReview]]
      );
      const byId = Object.fromEntries(rows.rows.map(r => [r.id, r]));
      expect(byId[myReview].reviewer_name).toBeNull();
      expect(byId[myReview].anonymized_at).not.toBeNull();
      expect(byId[otherReview].reviewer_name).toBe('Real Person');
    });

    // Regression: generated drafts were saved with no prompt version and no original text, so Settings > Prompts read "No replies
    // generated with this prompt yet" however many had been, and "needed edits" could never rise above 0%.
    it('stores the prompt version and the original text with a generated draft, and the prompt statistics count it', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const reviewId = await newReview(tenantId, await newLocation(tenantId), 'r-stats');
      const prompt = await pool.query<{ id: string }>(
        `INSERT INTO prompts (tenant_id, category, name) VALUES ($1, 'positive', 'Positive') RETURNING id`,
        [tenantId]
      );
      const promptId = prompt.rows[0]?.id as string;
      const version = await pool.query<{ id: string }>(
        `INSERT INTO prompt_versions (prompt_id, version, template) VALUES ($1, 1, 'Reply to {{review_text}}') RETURNING id`,
        [promptId]
      );
      const promptVersionId = version.rows[0]?.id as string;

      const responseId = await repo.insertGeneratedResponse({
        tenantId,
        reviewId,
        responseType: ResponseType.AUTO_REPLY_SUGGESTION,
        content: 'Thanks for coming!',
        promptVersionId,
        generationGroupId: null,
        generationMetadata: {},
      });

      const stored = await pool.query(
        `SELECT prompt_version_id, original_content, content FROM review_responses WHERE id = $1`,
        [responseId]
      );
      expect(stored.rows[0]).toMatchObject({
        prompt_version_id: promptVersionId,
        original_content: 'Thanks for coming!',
        content: 'Thanks for coming!',
      });

      const stats = await new ReviewsReadRepository(dbService).getPromptVersionStats({
        tenantId,
        promptId,
        version: 1,
      });
      expect(stats).toMatchObject({ totalGenerated: 1, pendingCount: 1 });
    });

    it('supersedes a post_failed sibling when another reply is chosen, but leaves a posted one', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const reviewId = await newReview(tenantId, await newLocation(tenantId), 'r2');
      const add = async (status: string): Promise<string> => {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO review_responses (tenant_id, review_id, response_type, content, source, status)
           VALUES ($1, $2, 'auto_reply_suggestion', 'x', 'ai_generated', $3::response_status) RETURNING id`,
          [tenantId, reviewId, status]
        );
        return rows[0]?.id as string;
      };
      const failed = await add('post_failed');
      const pending = await add('pending_approval');
      const chosen = await add('approved');

      const superseded = await dbService.db.transaction(tx =>
        repo.supersedeSiblingDrafts(tx, { reviewId, excludeResponseId: chosen })
      );

      expect(superseded.sort()).toEqual([failed, pending].sort());
    });
  });

  // Regression guards for hand-written SQL that no unit test reaches: the "removed on Google" marker is withdrawn
  // when Google lists the review again, and the Free-cap sweep only picks tenants actually over the cap.
  describe('ReviewSyncRepository.upsertReview — a review Google lists again', () => {
    const upsert = (
      repo: ReviewSyncRepository,
      tenantId: string,
      locationId: string
    ): Promise<{ id: string; inserted: boolean }> =>
      dbService.db.transaction(tx =>
        repo.upsertReview(tx, {
          tenantId,
          locationId,
          externalReviewId: 'r-relisted',
          externalReviewerId: null,
          rating: 4,
          reviewText: 'Back again',
          reviewerName: 'Real Person',
          reviewedAt: '2026-10-01T00:00:00Z',
          externalUpdatedAt: '2026-10-02T00:00:00Z',
          status: 'new' as never,
        })
      );
    const read = async (id: string): Promise<{ status: string; removed_upstream_at: unknown }> => {
      const { rows } = await pool.query<{ status: string; removed_upstream_at: unknown }>(
        'SELECT status, removed_upstream_at FROM reviews WHERE id = $1',
        [id]
      );
      return rows[0] as { status: string; removed_upstream_at: unknown };
    };

    it('clears the removed marker, back to in_review when the review has drafts', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const { id } = await upsert(repo, tenantId, locationId);
      await pool.query(
        `INSERT INTO review_responses (tenant_id, review_id, response_type, content, source, status)
         VALUES ($1, $2, 'auto_reply_suggestion', 'x', 'ai_generated', 'post_failed')`,
        [tenantId, id]
      );
      await repo.markReviewRemovedUpstream({ reviewId: id, tenantId });
      expect((await read(id)).status).toBe('removed');

      await upsert(repo, tenantId, locationId);

      expect(await read(id)).toEqual({ status: 'in_review', removed_upstream_at: null });
    });

    it('goes back to new when the review has no drafts, and leaves other statuses alone', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const { id } = await upsert(repo, tenantId, locationId);
      await repo.markReviewRemovedUpstream({ reviewId: id, tenantId });

      await upsert(repo, tenantId, locationId);
      expect((await read(id)).status).toBe('new');

      await pool.query(`UPDATE reviews SET status = 'responded' WHERE id = $1`, [id]);
      await upsert(repo, tenantId, locationId);
      expect((await read(id)).status).toBe('responded');
    });
  });

  describe('TenantSubscriptionsRepository.findFreeTenantIdsOverLocationCap', () => {
    it('returns only Free tenants with more active, unpaused locations than the cap', async () => {
      const repo = new TenantSubscriptionsRepository(dbService);
      const plans = new BillingPlansRepository(dbService);
      const free = await plans.findByCode('free' as never);
      const paid = await plans.findByCode('paid' as never);
      const freeCap = free?.maxLocations ?? 1;
      const addLocations = async (tenantId: string, count: number, paused = 0): Promise<void> => {
        const userId = await newUser(tenantId);
        const conn = await pool.query<{ id: string }>(
          `INSERT INTO review_provider_connections
             (tenant_id, connected_by_user_id, provider_account_id, credential_reference)
           VALUES ($1, $2, 'accounts/1', 'ref') RETURNING id`,
          [tenantId, userId]
        );
        for (let i = 0; i < count; i += 1) {
          await pool.query(
            `INSERT INTO locations (tenant_id, provider_connection_id, external_location_id, name, billing_paused_at)
             VALUES ($1, $2, $3, 'Spec Location', $4)`,
            [tenantId, conn.rows[0]?.id, `locations/${i}`, i < paused ? new Date() : null]
          );
        }
      };
      const onPlan = async (planId: string | undefined): Promise<string> => {
        const tenantId = await newTenant();
        await pool.query('INSERT INTO tenant_subscriptions (tenant_id, plan_id) VALUES ($1, $2)', [
          tenantId,
          planId,
        ]);
        return tenantId;
      };

      const over = await onPlan(free?.id);
      await addLocations(over, freeCap + 1);
      const atCap = await onPlan(free?.id);
      await addLocations(atCap, freeCap);
      const overButPaused = await onPlan(free?.id);
      await addLocations(overButPaused, freeCap + 1, 1);
      const paidMany = await onPlan(paid?.id);
      await addLocations(paidMany, freeCap + 3);

      const found = await repo.findFreeTenantIdsOverLocationCap();

      expect(found).toContain(over);
      expect(found).not.toContain(atCap);
      expect(found).not.toContain(overButPaused);
      expect(found).not.toContain(paidMany);
    });
  });

  describe('admin list pages', () => {
    const tag = `paged-${Math.random().toString(36).slice(2, 8)}`;

    it('pages businesses newest first with a total that matches the same search, with no gaps or repeats', async () => {
      const repo = new AdminBusinessesRepository(dbService);
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO tenants (name, status) VALUES ($1, 'active') RETURNING id`,
          [`${tag} Business ${i}`]
        );
        ids.push(rows[0]?.id as string);
        tenants.push(rows[0]?.id as string);
      }

      const first = await repo.findPage({ search: tag, page: 1, pageSize: 2 });
      const second = await repo.findPage({ search: tag, page: 2, pageSize: 2 });
      const third = await repo.findPage({ search: tag, page: 3, pageSize: 2 });

      expect(first.total).toBe(5);
      expect(second.total).toBe(5);
      const seen = [...first.rows, ...second.rows, ...third.rows].map(row => row.id);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect(seen.sort()).toEqual([...ids].sort());
      expect(third.rows).toHaveLength(1);
    });

    it('counts and pages users with the same search, never listing an anonymized one', async () => {
      const repo = new AdminUsersRepository(dbService);
      const tenantId = await newTenant();
      for (let i = 0; i < 3; i += 1) {
        await pool.query(
          `INSERT INTO users (tenant_id, email, name, role, status)
           VALUES ($1, $2, $3, 'member', 'active')`,
          [tenantId, `${tag}-${i}@example.test`, `${tag} User ${i}`]
        );
      }
      await pool.query(
        `INSERT INTO users (tenant_id, email, name, role, status, anonymized_at)
         VALUES ($1, $2, $3, 'member', 'active', now())`,
        [tenantId, `${tag}-gone@example.test`, `${tag} Gone`]
      );

      const page = await repo.findPage({ search: tag, page: 1, pageSize: 2 });
      const rest = await repo.findPage({ search: tag, page: 2, pageSize: 2 });

      expect(page.total).toBe(3);
      expect(page.rows).toHaveLength(2);
      expect(rest.rows).toHaveLength(1);
    });
  });

  describe('ReviewSyncRepository: a review the model cannot answer', () => {
    async function candidate(
      tenantId: string,
      locationId: string,
      externalId: string
    ): Promise<string> {
      return (
        await pool.query<{ id: string }>(
          `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating, review_text, classification, status, reviewed_at)
           VALUES ($1, $2, $3, 3, 'Hmm', 'auto_reply_candidate', 'new', now()) RETURNING id`,
          [tenantId, locationId, externalId]
        )
      ).rows[0]?.id as string;
    }

    it('steps aside after a failure, comes back after its pause, and is given up on after the last attempt', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const poison = await candidate(tenantId, locationId, 'poison');
      const fine = await candidate(tenantId, locationId, 'fine');
      const idsFor = async (): Promise<string[]> =>
        (await repo.findClassifiedNeedingGeneration(tenantId, locationId, 10)).map(row => row.id);

      expect(await idsFor()).toEqual(expect.arrayContaining([poison, fine]));

      // First failure: counted, and it no longer sits at the head of the batch.
      await pool.query(`UPDATE reviews SET status = 'in_review' WHERE id = $1`, [poison]);
      await expect(repo.releaseGenerationClaimAfterFailure(poison)).resolves.toBe(1);
      expect(await idsFor()).toEqual([fine]);

      // Its pause (attempts x 15 minutes) over: tried again.
      await pool.query(
        `UPDATE reviews SET generation_failed_at = now() - interval '16 minutes' WHERE id = $1`,
        [poison]
      );
      expect(await idsFor()).toEqual(expect.arrayContaining([poison, fine]));

      // After the last attempt it is left for the owner, however long ago it failed.
      await pool.query(
        `UPDATE reviews SET generation_attempts = 5, generation_failed_at = now() - interval '10 days' WHERE id = $1`,
        [poison]
      );
      expect(await idsFor()).toEqual([fine]);
    });

    it('only counts a failure for a review that is still being drafted', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const id = await candidate(tenantId, locationId, 'moved-on');

      await expect(repo.releaseGenerationClaimAfterFailure(id)).resolves.toBeNull();
    });

    it('gives it a fresh set of attempts when Google reports new text, and keeps the count otherwise', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const upsert = (text: string): Promise<{ id: string }> =>
        dbService.db.transaction(tx =>
          repo.upsertReview(tx, {
            tenantId,
            locationId,
            externalReviewId: 'r-poison',
            externalReviewerId: null,
            rating: 3,
            reviewText: text,
            reviewerName: null,
            reviewedAt: '2026-10-01T00:00:00Z',
            externalUpdatedAt: '2026-10-02T00:00:00Z',
            status: 'new' as never,
          })
        );
      const { id } = await upsert('first words');
      await pool.query(`UPDATE reviews SET generation_attempts = 4 WHERE id = $1`, [id]);

      await upsert('first words');
      expect(
        (await pool.query(`SELECT generation_attempts FROM reviews WHERE id = $1`, [id])).rows[0]
          ?.generation_attempts
      ).toBe(4);

      await upsert('edited words');
      expect(
        (await pool.query(`SELECT generation_attempts FROM reviews WHERE id = $1`, [id])).rows[0]
          ?.generation_attempts
      ).toBe(0);
    });
  });

  describe('StripeWebhookEventsRepository.deleteProcessedBefore', () => {
    it('removes only ledger rows older than the cutoff', async () => {
      const repo = new StripeWebhookEventsRepository(dbService);
      const tag = Math.random().toString(36).slice(2);
      await pool.query(
        `INSERT INTO stripe_webhook_events (id, type, processed_at) VALUES
           ($1, 'invoice.paid', now() - interval '120 days'),
           ($2, 'invoice.paid', now() - interval '2 days')`,
        [`evt_old_${tag}`, `evt_new_${tag}`]
      );

      const removed = await repo.deleteProcessedBefore(new Date(Date.now() - 90 * 86_400_000));

      expect(removed).toBeGreaterThanOrEqual(1);
      const left = await pool.query<{ id: string }>(
        `SELECT id FROM stripe_webhook_events WHERE id = ANY($1::text[])`,
        [[`evt_old_${tag}`, `evt_new_${tag}`]]
      );
      expect(left.rows.map(row => row.id)).toEqual([`evt_new_${tag}`]);
    });
  });

  describe('ReviewSyncRepository.purgeExpiredReviewerPii', () => {
    it('anonymizes only reviews past their tenant’s retention, leaving other tenants and recent reviews alone', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const otherTenant = await newTenant();
      const locationId = await newLocation(tenantId);
      const otherLocation = await newLocation(otherTenant);
      await pool.query(
        `INSERT INTO tenant_settings (tenant_id, review_data_retention_months) VALUES ($1, 6)
         ON CONFLICT (tenant_id) DO UPDATE SET review_data_retention_months = 6`,
        [tenantId]
      );
      const review = async (tenant: string, location: string, monthsOld: number): Promise<string> =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating, reviewer_name, external_reviewer_id, reviewed_at)
             VALUES ($1, $2, $3, 4, 'Jane', 'g-1', now() - ($4 || ' months')::interval) RETURNING id`,
            [tenant, location, `r-${Math.random().toString(36).slice(2)}`, monthsOld]
          )
        ).rows[0]?.id as string;
      const old = await review(tenantId, locationId, 12);
      const recent = await review(tenantId, locationId, 1);
      const noRetention = await review(otherTenant, otherLocation, 60);

      await expect(repo.purgeExpiredReviewerPii()).resolves.toBeGreaterThanOrEqual(1);

      const named = async (id: string): Promise<string | null> =>
        (
          await pool.query<{ reviewer_name: string | null }>(
            `SELECT reviewer_name FROM reviews WHERE id = $1`,
            [id]
          )
        ).rows[0]?.reviewer_name ?? null;
      expect(await named(old)).toBeNull();
      expect(await named(recent)).toBe('Jane');
      expect(await named(noRetention)).toBe('Jane');

      // Nothing left to do the second time.
      const again = await repo.purgeExpiredReviewerPii();
      expect(again).toBe(0);
    });
  });

  describe('AuthRepository.requestMemberRemoval: the last owner', () => {
    it('refuses the last ACTIVE owner even when a disabled or removal-pending one remains', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const owner = async (status: string): Promise<string> =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO users (tenant_id, email, name, role, status) VALUES ($1, $2, 'Owner', 'owner', $3::user_status) RETURNING id`,
            [tenantId, `o-${Math.random().toString(36).slice(2)}@example.test`, status]
          )
        ).rows[0]?.id as string;
      const active = await owner('active');
      await owner('disabled');

      await expect(repo.requestMemberRemoval(tenantId, active)).resolves.toEqual({
        outcome: 'last_owner',
      });
    });

    it('allows removing an owner when another active one remains', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const first = await newUser(tenantId);
      await newUser(tenantId);

      await expect(repo.requestMemberRemoval(tenantId, first)).resolves.toMatchObject({
        outcome: 'requested',
      });
    });
  });

  describe('ReviewSyncRepository.markRespondedByExternalReply', () => {
    it('closes the review and supersedes the drafts nobody has decided, leaving a live reply for the worker', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const review = (
        await pool.query<{ id: string }>(
          `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating, status)
           VALUES ($1, $2, 'r-ext', 4, 'in_review') RETURNING id`,
          [tenantId, locationId]
        )
      ).rows[0]?.id as string;
      const addResponse = async (status: string): Promise<string> =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO review_responses (tenant_id, review_id, response_type, content, source, status)
             VALUES ($1, $2, 'auto_reply_suggestion', $3, 'ai_generated', $4::response_status) RETURNING id`,
            [tenantId, review, `draft ${status}`, status]
          )
        ).rows[0]?.id as string;
      const pending = await addResponse('pending_approval');
      const draft = await addResponse('draft');
      const failed = await addResponse('post_failed');
      const rejected = await addResponse('rejected');
      const approved = await addResponse('approved');

      await dbService.db.transaction(tx => repo.markRespondedByExternalReply(tx, review));

      const statuses = Object.fromEntries(
        (
          await pool.query<{ id: string; status: string }>(
            `SELECT id, status FROM review_responses WHERE review_id = $1`,
            [review]
          )
        ).rows.map(row => [row.id, row.status])
      );
      expect(statuses[pending]).toBe('superseded');
      expect(statuses[draft]).toBe('superseded');
      expect(statuses[failed]).toBe('superseded');
      expect(statuses[rejected]).toBe('rejected');
      expect(statuses[approved]).toBe('approved');
      expect(
        (await pool.query(`SELECT status FROM reviews WHERE id = $1`, [review])).rows[0]?.status
      ).toBe('responded');

      // Idempotent.
      await dbService.db.transaction(tx => repo.markRespondedByExternalReply(tx, review));
    });
  });

  describe('Review provider connections: one live per tenant', () => {
    const connect = (
      repo: ConnectionsRepository,
      tenantId: string,
      userId: string,
      account: string
    ): Promise<unknown> =>
      dbService.db.transaction(tx =>
        repo.upsertConnection(tx, {
          tenantId,
          connectedByUserId: userId,
          providerAccountId: account,
          credentialReference: `ref-${account}`,
          tokenExpiresAt: null,
        })
      );

    it('refuses a second live connection for another account, but allows one once the first is disconnected', async () => {
      const repo = new ConnectionsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await newUser(tenantId);

      await connect(repo, tenantId, userId, 'accounts/1');
      await expect(connect(repo, tenantId, userId, 'accounts/2')).rejects.toMatchObject({
        cause: {
          code: '23505',
          constraint: 'idx_review_provider_connections_tenant_provider_live',
        },
      });

      await pool.query(
        `UPDATE review_provider_connections SET disconnected_at = now() WHERE tenant_id = $1`,
        [tenantId]
      );
      await expect(connect(repo, tenantId, userId, 'accounts/2')).resolves.toBeDefined();
    });

    it('still lets a reconnect with the same account update its own row', async () => {
      const repo = new ConnectionsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await newUser(tenantId);

      await connect(repo, tenantId, userId, 'accounts/1');
      await expect(connect(repo, tenantId, userId, 'accounts/1')).resolves.toBeDefined();
    });

    it('reads the live connection first, then the most recently disconnected, and never flags a disconnected one', async () => {
      const repo = new ConnectionsRepository(dbService);
      const tenantId = await newTenant();
      const userId = await newUser(tenantId);
      const insert = async (account: string, disconnectedAt: string | null): Promise<string> =>
        (
          await pool.query<{ id: string }>(
            `INSERT INTO review_provider_connections (tenant_id, connected_by_user_id, provider_account_id, credential_reference, disconnected_at)
             VALUES ($1, $2, $3, 'ref', $4) RETURNING id`,
            [tenantId, userId, account, disconnectedAt]
          )
        ).rows[0]?.id as string;
      const older = await insert('accounts/1', '2026-08-01T00:00:00Z');
      const newer = await insert('accounts/2', '2026-09-01T00:00:00Z');

      // No live one: the most recently disconnected, not the oldest.
      expect((await repo.findConnectionByTenant(tenantId))?.id).toBe(newer);
      expect(await repo.markNeedsReauth(newer)).toBe(false);
      expect(await repo.markNeedsReauth(older)).toBe(false);

      const live = await insert('accounts/3', null);
      expect((await repo.findConnectionByTenant(tenantId))?.id).toBe(live);
      expect((await repo.findConnectionsByTenant(tenantId)).map(row => row.id).sort()).toEqual(
        [older, newer, live].sort()
      );
      expect(await repo.markNeedsReauth(live)).toBe(true);
    });

    it('finds a connection by id only inside its own tenant', async () => {
      const repo = new ConnectionsRepository(dbService);
      const tenantId = await newTenant();
      const otherTenant = await newTenant();
      const userId = await newUser(tenantId);
      await connect(repo, tenantId, userId, 'accounts/1');
      const id = (await repo.findConnectionByTenant(tenantId))?.id as string;

      expect((await repo.findConnectionById(id, tenantId))?.id).toBe(id);
      expect(await repo.findConnectionById(id, otherTenant)).toBeNull();
    });
  });

  describe('Cancelling a request restores the status it replaced', () => {
    const statusOf = async (table: 'tenants' | 'users', id: string): Promise<string> =>
      (await pool.query<{ status: string }>(`SELECT status FROM ${table} WHERE id = $1`, [id]))
        .rows[0]?.status as string;
    const member = async (tenantId: string, status: string, verified = true): Promise<string> =>
      (
        await pool.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, name, role, status, email_verified_at, password_hash)
           VALUES ($1, $2, 'Member', 'member', $3::user_status, ${verified ? 'now()' : 'NULL'}, ${verified ? `'hash'` : 'NULL'}) RETURNING id`,
          [tenantId, `m-${Math.random().toString(36).slice(2)}@example.test`, status]
        )
      ).rows[0]?.id as string;

    it("does not lift an admin's deactivation when an owner requests and then cancels a member's removal", async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const deactivated = await member(tenantId, 'disabled');
      const live = await member(tenantId, 'active');

      for (const id of [deactivated, live]) {
        await repo.requestMemberRemoval(tenantId, id);
        await repo.cancelMemberRemoval(tenantId, id);
      }

      expect(await statusOf('users', deactivated)).toBe('disabled');
      expect(await statusOf('users', live)).toBe('active');
    });

    it('restores an unaccepted invite as invited, and survives a request made twice', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const invited = await member(tenantId, 'invited', false);

      await repo.requestMemberRemoval(tenantId, invited);
      await repo.requestMemberRemoval(tenantId, invited); // the second must not record `disabled` as the prior status
      await repo.cancelMemberRemoval(tenantId, invited);

      expect(await statusOf('users', invited)).toBe('invited');
    });

    it("does not lift an admin's suspension when an erasure request is cancelled, whoever cancels it", async () => {
      const businesses = new AdminBusinessesRepository(dbService);
      const auth = new AuthRepository(dbService);
      const adminSuspended = await newTenant('suspended');
      const ownerAsked = await newTenant('active');
      const owner = await newUser(ownerAsked);
      const pendingActivation = await newTenant('pending_activation');
      const pendingOwner = await newUser(pendingActivation);

      await businesses.requestErasure(adminSuspended);
      await businesses.cancelErasure(adminSuspended);
      await auth.requestTenantErasureBySelf({ tenantId: ownerAsked, requestedByUserId: owner });
      await auth.cancelSelfRequestedErasure({
        tenantId: ownerAsked,
        requestedByUserId: owner,
        gracePeriodDays: 21,
      });
      await auth.requestTenantErasureBySelf({
        tenantId: pendingActivation,
        requestedByUserId: pendingOwner,
      });
      await auth.cancelSelfRequestedErasure({
        tenantId: pendingActivation,
        requestedByUserId: pendingOwner,
        gracePeriodDays: 21,
      });

      expect(await statusOf('tenants', adminSuspended)).toBe('suspended');
      expect(await statusOf('tenants', ownerAsked)).toBe('active');
      // Used to come back `active`, skipping the activation the business still owed.
      expect(await statusOf('tenants', pendingActivation)).toBe('pending_activation');
    });

    it("keeps the original status when an admin takes over an owner's pending request", async () => {
      const businesses = new AdminBusinessesRepository(dbService);
      const auth = new AuthRepository(dbService);
      const tenantId = await newTenant('active');
      const owner = await newUser(tenantId);

      await auth.requestTenantErasureBySelf({ tenantId, requestedByUserId: owner });
      await businesses.requestErasure(tenantId); // by now the tenant reads `suspended`: that must not become "what it was"
      await businesses.cancelErasure(tenantId);

      expect(await statusOf('tenants', tenantId)).toBe('active');
    });
  });

  describe('AdminUsersRepository.toggleActive', () => {
    const user = async (status: string, verified = true): Promise<string> => {
      const tenantId = await newTenant();
      return (
        await pool.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, name, role, status, email_verified_at, password_hash)
           VALUES ($1, $2, 'Member', 'member', $3::user_status, ${verified ? 'now()' : 'NULL'}, ${verified ? `'hash'` : 'NULL'}) RETURNING id`,
          [tenantId, `t-${Math.random().toString(36).slice(2)}@example.test`, status]
        )
      ).rows[0]?.id as string;
    };
    const statusOf = async (id: string): Promise<string> =>
      (await pool.query<{ status: string }>(`SELECT status FROM users WHERE id = $1`, [id])).rows[0]
        ?.status as string;

    it('flips when no target is named, as before', async () => {
      const repo = new AdminUsersRepository(dbService);
      const id = await user('active');

      await expect(repo.toggleActive(id)).resolves.toEqual({ outcome: 'toggled' });
      expect(await statusOf(id)).toBe('disabled');
      await expect(repo.toggleActive(id)).resolves.toEqual({ outcome: 'toggled' });
      expect(await statusOf(id)).toBe('active');
    });

    // The bug: a stale list or a double click re-enabled someone an admin had just deactivated.
    it('puts the user in the named state and leaves one already there alone, however often it is asked', async () => {
      const repo = new AdminUsersRepository(dbService);
      const id = await user('active');

      await expect(repo.toggleActive(id, false)).resolves.toEqual({ outcome: 'toggled' });
      await expect(repo.toggleActive(id, false)).resolves.toEqual({ outcome: 'unchanged' });
      expect(await statusOf(id)).toBe('disabled');

      await expect(repo.toggleActive(id, true)).resolves.toEqual({ outcome: 'toggled' });
      await expect(repo.toggleActive(id, true)).resolves.toEqual({ outcome: 'unchanged' });
      expect(await statusOf(id)).toBe('active');
    });

    it('never touches a member who has not accepted their invite', async () => {
      const repo = new AdminUsersRepository(dbService);
      const id = await user('invited', false);

      await expect(repo.toggleActive(id)).resolves.toEqual({ outcome: 'invited' });
      await expect(repo.toggleActive(id, false)).resolves.toEqual({ outcome: 'invited' });
      expect(await statusOf(id)).toBe('invited');
    });

    it('re-enables a never-verified signup as pending_verification, not active', async () => {
      const repo = new AdminUsersRepository(dbService);
      const tenantId = await newTenant();
      const id = (
        await pool.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, name, role, status, password_hash)
           VALUES ($1, $2, 'Signup', 'owner', 'disabled', 'hash') RETURNING id`,
          [tenantId, `s-${Math.random().toString(36).slice(2)}@example.test`]
        )
      ).rows[0]?.id as string;

      await repo.toggleActive(id, true);

      expect(await statusOf(id)).toBe('pending_verification');
    });
  });

  describe('TenantSubscriptionsRepository.advanceEventClock', () => {
    const subscribedTenant = async (): Promise<string> => {
      const { rows: plans } = await pool.query<{ id: string }>(
        `SELECT id FROM billing_plans WHERE code = 'free'`
      );
      const tenantId = await newTenant();
      await pool.query('INSERT INTO tenant_subscriptions (tenant_id, plan_id) VALUES ($1, $2)', [
        tenantId,
        plans[0]?.id,
      ]);
      return tenantId;
    };

    it('lets the first event through and rejects anything older than the newest applied', async () => {
      const repo = new TenantSubscriptionsRepository(dbService);
      const tenantId = await subscribedTenant();

      await expect(repo.advanceEventClock(tenantId, '2026-09-01T10:00:00.000Z')).resolves.toBe(
        true
      );
      await expect(repo.advanceEventClock(tenantId, '2026-09-01T10:05:00.000Z')).resolves.toBe(
        true
      );
      // A late delivery of something that happened before the newest applied event.
      await expect(repo.advanceEventClock(tenantId, '2026-09-01T10:02:00.000Z')).resolves.toBe(
        false
      );

      const { rows } = await pool.query(
        'SELECT stripe_last_event_at FROM tenant_subscriptions WHERE tenant_id = $1',
        [tenantId]
      );
      const row = rows[0] as { stripe_last_event_at: string };
      expect(new Date(row.stripe_last_event_at).toISOString()).toBe('2026-09-01T10:05:00.000Z');
    });

    it('treats an event from the same second as current, since there is no order to recover', async () => {
      const repo = new TenantSubscriptionsRepository(dbService);
      const tenantId = await subscribedTenant();

      await repo.advanceEventClock(tenantId, '2026-09-01T10:00:00.000Z');

      await expect(repo.advanceEventClock(tenantId, '2026-09-01T10:00:00.000Z')).resolves.toBe(
        true
      );
    });

    it('reports false for a tenant with no subscription row', async () => {
      const repo = new TenantSubscriptionsRepository(dbService);
      const tenantId = await newTenant();

      await expect(repo.advanceEventClock(tenantId, '2026-09-01T10:00:00.000Z')).resolves.toBe(
        false
      );
    });
  });

  describe('AdminBusinessesRepository — repeated actions', () => {
    it('reports whether a status change changed anything', async () => {
      const repo = new AdminBusinessesRepository(dbService);
      const tenantId = await newTenant('active');

      await expect(repo.setStatus({ tenantId, status: TenantStatus.SUSPENDED })).resolves.toEqual({
        outcome: 'updated',
        changed: true,
      });
      await expect(repo.setStatus({ tenantId, status: TenantStatus.SUSPENDED })).resolves.toEqual({
        outcome: 'updated',
        changed: false,
      });
      await expect(repo.setStatus({ tenantId, status: TenantStatus.ACTIVE })).resolves.toEqual({
        outcome: 'updated',
        changed: true,
      });
    });

    it('does not restart the grace period when erasure is requested again', async () => {
      const repo = new AdminBusinessesRepository(dbService);
      const tenantId = await newTenant('active');

      await expect(repo.requestErasure(tenantId)).resolves.toBe('requested');
      const first = await pool.query(`SELECT erasure_requested_at FROM tenants WHERE id = $1`, [
        tenantId,
      ]);
      await expect(repo.requestErasure(tenantId)).resolves.toBe('already_requested');
      const second = await pool.query(`SELECT erasure_requested_at FROM tenants WHERE id = $1`, [
        tenantId,
      ]);

      expect(second.rows[0].erasure_requested_at).toEqual(first.rows[0].erasure_requested_at);
    });

    it("takes over an owner's own pending request, since it removes the owner's right to restore", async () => {
      const repo = new AdminBusinessesRepository(dbService);
      const tenantId = await newTenant('active');
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, name, role, status)
         VALUES ($1, $2, 'Owner', 'owner', 'active') RETURNING id`,
        [tenantId, `owner-${Math.random().toString(36).slice(2)}@example.test`]
      );
      await pool.query(
        `UPDATE tenants SET erasure_requested_at = now(), erasure_requested_by_user_id = $2 WHERE id = $1`,
        [tenantId, rows[0]?.id]
      );

      await expect(repo.requestErasure(tenantId)).resolves.toBe('requested');

      const after = await pool.query(
        `SELECT erasure_requested_by_user_id FROM tenants WHERE id = $1`,
        [tenantId]
      );
      expect(after.rows[0].erasure_requested_by_user_id).toBeNull();
    });

    it('reports an unknown or already erased tenant as not found', async () => {
      const repo = new AdminBusinessesRepository(dbService);
      const erased = await newTenant('active');
      await pool.query(`UPDATE tenants SET status = 'erased' WHERE id = $1`, [erased]);

      await expect(repo.requestErasure('00000000-0000-0000-0000-000000000000')).resolves.toBe(
        'not_found'
      );
      await expect(repo.requestErasure(erased)).resolves.toBe('not_found');
    });

    it('cancels a pending erasure once, then has nothing left to cancel', async () => {
      const repo = new AdminBusinessesRepository(dbService);
      const tenantId = await newTenant('active');
      await repo.requestErasure(tenantId);

      await expect(repo.cancelErasure(tenantId)).resolves.toBe(true);
      await expect(repo.cancelErasure(tenantId)).resolves.toBe(false);
    });
  });

  describe('ReviewSyncRepository — noting a rate-limit wait', () => {
    it('stores the note and a heartbeat on a running run, and leaves a finished run alone', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const run = async (status: string): Promise<string> => {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO sync_runs (tenant_id, location_id, "trigger", status, updated_at)
           VALUES ($1, $2, 'scheduled', $3::sync_run_status, now() - interval '5 minutes') RETURNING id`,
          [tenantId, locationId, status]
        );
        return rows[0]?.id as string;
      };
      const finished = await run('ok');
      await repo.noteSyncRunWaiting(finished, 'waiting');
      const untouched = await pool.query('SELECT error_message FROM sync_runs WHERE id = $1', [
        finished,
      ]);
      expect(untouched.rows[0].error_message).toBeNull();

      const running = await run('running');
      await repo.noteSyncRunWaiting(running, 'waiting for Google');

      const { rows } = await pool.query(
        `SELECT status, error_message, updated_at > now() - interval '1 minute' AS fresh FROM sync_runs WHERE id = $1`,
        [running]
      );
      expect(rows[0]).toMatchObject({
        status: 'running',
        error_message: 'waiting for Google',
        fresh: true,
      });
    });
  });

  describe('ReviewSyncRepository — deleted-review reconciliation', () => {
    const reviewIn = async (
      tenantId: string,
      locationId: string,
      ext: string,
      status: string,
      createdAt = '2026-01-01T00:00:00Z'
    ): Promise<string> => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating, status, created_at)
         VALUES ($1, $2, $3, 4, $4::review_status, $5) RETURNING id`,
        [tenantId, locationId, ext, status, createdAt]
      );
      return rows[0]?.id as string;
    };

    it('lists only open, not-yet-removed reviews older than the cutoff', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const open = await reviewIn(tenantId, locationId, 'r-open', 'new');
      await reviewIn(tenantId, locationId, 'r-answered', 'responded');
      await reviewIn(tenantId, locationId, 'r-removed', 'removed');
      await reviewIn(tenantId, locationId, 'r-fresh', 'new', '2026-12-31T00:00:00Z');

      const found = await repo.findOpenReviewsForReconciliation({
        locationId,
        createdBefore: '2026-06-01T00:00:00Z',
      });

      expect(found).toEqual([{ id: open, externalReviewId: 'r-open' }]);
    });

    it('marks open reviews removed but never an answered one', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const open = await reviewIn(tenantId, locationId, 'r-open', 'in_review');
      const answered = await reviewIn(tenantId, locationId, 'r-answered', 'responded');

      expect(await repo.markReviewsRemovedUpstream([open, answered])).toBe(1);

      const { rows } = await pool.query(
        'SELECT id, status, removed_upstream_at FROM reviews WHERE id = ANY($1::uuid[])',
        [[open, answered]]
      );
      const byId = Object.fromEntries(rows.map(row => [row.id, row]));
      expect(byId[open].status).toBe('removed');
      expect(byId[open].removed_upstream_at).not.toBeNull();
      expect(byId[answered].status).toBe('responded');
    });

    it('restores a listed-again review to in_review with drafts, new without', async () => {
      const repo = new ReviewSyncRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const withDraft = await reviewIn(tenantId, locationId, 'r-draft', 'new');
      const bare = await reviewIn(tenantId, locationId, 'r-bare', 'new');
      await pool.query(
        `INSERT INTO review_responses (tenant_id, review_id, response_type, content, source, status)
         VALUES ($1, $2, 'auto_reply_suggestion', 'x', 'ai_generated', 'post_failed')`,
        [tenantId, withDraft]
      );
      await repo.markReviewsRemovedUpstream([withDraft, bare]);
      // Force both to the removed state a past 404 would have left them in.
      await pool.query(`UPDATE reviews SET status = 'removed' WHERE id = ANY($1::uuid[])`, [
        [withDraft, bare],
      ]);

      const restored = await repo.restoreRelistedReviews({
        locationId,
        externalReviewIds: ['r-draft', 'r-bare', 'r-unknown'],
      });

      expect(restored).toBe(2);
      const { rows } = await pool.query(
        'SELECT id, status, removed_upstream_at FROM reviews WHERE id = ANY($1::uuid[])',
        [[withDraft, bare]]
      );
      const byId = Object.fromEntries(rows.map(row => [row.id, row]));
      expect(byId[withDraft]).toMatchObject({ status: 'in_review', removed_upstream_at: null });
      expect(byId[bare]).toMatchObject({ status: 'new', removed_upstream_at: null });
    });
  });

  describe('AuthRepository.anonymizeUser', () => {
    it('also removes the user’s refresh and one-time tokens', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const userId = await newUser(tenantId);
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, 'h1', now() + interval '1 day')`,
        [userId]
      );
      await pool.query(
        `INSERT INTO user_auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, 'h2', 'verify_email', now() + interval '1 day')`,
        [userId]
      );

      expect((await repo.anonymizeUser(userId)).outcome).toBe('anonymized');

      const counts = await pool.query(
        `SELECT (SELECT count(*) FROM refresh_tokens WHERE user_id = $1)::int AS refresh,
                (SELECT count(*) FROM user_auth_tokens WHERE user_id = $1)::int AS reset`,
        [userId]
      );
      expect(counts.rows[0]).toEqual({ refresh: 0, reset: 0 });
      expect((await repo.anonymizeUser(userId)).outcome).toBe('already_anonymized');
    });
  });

  describe('platform_activity_log — the entry shapes the table accepts', () => {
    const insert = (columns: string, values: unknown[]): Promise<unknown> =>
      pool.query(
        `INSERT INTO platform_activity_log (type, actor_email, ${columns}) VALUES ($1::platform_activity_type, 'admin@example.test', ${values
          .slice(1)
          .map((_, index) => `$${index + 2}`)
          .join(', ')})`,
        values
      );

    afterEach(async () => {
      await pool.query(
        `DELETE FROM platform_activity_log WHERE actor_email = 'admin@example.test'`
      );
    });

    it('accepts a settings change that carries its details and nothing business-specific', async () => {
      await expect(
        insert('details', [
          'platform_settings_changed',
          JSON.stringify({ changes: [{ field: 'googleLoginEnabled', from: true, to: false }] }),
        ])
      ).resolves.toBeDefined();
    });

    it('refuses a settings change without details, or one that names a business', async () => {
      await expect(
        pool.query(
          `INSERT INTO platform_activity_log (type, actor_email) VALUES ('platform_settings_changed', 'admin@example.test')`
        )
      ).rejects.toThrow(/platform_activity_log_target_check/);
      await expect(
        insert('business_name, details', ['platform_settings_changed', 'Acme', '{"changes":[]}'])
      ).rejects.toThrow(/platform_activity_log_target_check/);
    });

    it('accepts business_joined with a business name, and refuses it without one', async () => {
      await expect(insert('business_name', ['business_joined', 'Acme'])).resolves.toBeDefined();
      await expect(
        pool.query(
          `INSERT INTO platform_activity_log (type, actor_email) VALUES ('business_joined', 'admin@example.test')`
        )
      ).rejects.toThrow(/platform_activity_log_target_check/);
    });
  });

  describe('ReviewsReadRepository.countAiGeneratedResponsesThisMonth', () => {
    it('counts an AI draft the owner edited, but not a reply written by hand or imported', async () => {
      const repo = new ReviewsReadRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
      ).toISOString();

      const addResponse = async (source: string, createdAt = 'now()'): Promise<void> => {
        const review = await pool.query<{ id: string }>(
          `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating)
           VALUES ($1, $2, $3, 5) RETURNING id`,
          [tenantId, locationId, `r-${Math.random().toString(36).slice(2)}`]
        );
        await pool.query(
          `INSERT INTO review_responses (tenant_id, review_id, response_type, content, source, status, created_at)
           VALUES ($1, $2, 'auto_reply_suggestion', 'x', $3::response_source, 'approved', ${createdAt})`,
          [tenantId, review.rows[0]?.id, source]
        );
      };
      await addResponse('ai_generated');
      await addResponse('human_edited'); // an edited draft cost an LLM call and must not free its slot
      await addResponse('human_manual');
      await addResponse('imported');
      await addResponse('ai_generated', `now() - interval '40 days'`); // last month's

      await expect(repo.countAiGeneratedResponsesThisMonth(tenantId, monthStart)).resolves.toBe(2);
    });
  });

  describe('Erasure — what an erased business and user leave behind', () => {
    const count = async (sql: string, params: unknown[]): Promise<number> =>
      Number((await pool.query<{ n: string }>(sql, params)).rows[0]?.n);

    async function seedBusiness(): Promise<{ tenantId: string; userId: string; reviewId: string }> {
      const tenantId = await newTenant('suspended');
      const userId = await newUser(tenantId);
      const locationId = await newLocation(tenantId);
      await pool.query(
        `UPDATE locations SET address = '1 High St', phone = '555-0100', website_uri = 'https://cafe.example' WHERE id = $1`,
        [locationId]
      );
      const review = await pool.query<{ id: string }>(
        `INSERT INTO reviews (tenant_id, location_id, external_review_id, external_reviewer_id, reviewer_name, review_text, rating, matched_keywords)
         VALUES ($1, $2, 'r-1', 'g-123', 'Jane Reviewer', 'Lovely, ask for Bob', 5, '["rival cafe"]'::jsonb) RETURNING id`,
        [tenantId, locationId]
      );
      const reviewId = review.rows[0]?.id as string;
      await pool.query(
        `INSERT INTO review_responses (tenant_id, review_id, response_type, content, original_content, source, status, error_message)
         VALUES ($1, $2, 'auto_reply_suggestion', 'Thanks Jane!', 'Thank you, Jane, for visiting Acme Cafe!', 'ai_generated', 'post_failed', 'Google said no')`,
        [tenantId, reviewId]
      );
      await pool.query(
        `INSERT INTO in_app_notifications (tenant_id, user_id, type, title, review_id)
         SELECT $1, $2, enumlabel::in_app_notification_type, 'Jane Reviewer left a review', $3
         FROM pg_enum WHERE enumtypid = 'in_app_notification_type'::regtype LIMIT 1`,
        [tenantId, userId, reviewId]
      );
      await pool.query(`INSERT INTO blocklist_terms (tenant_id, term) VALUES ($1, 'rival cafe')`, [
        tenantId,
      ]);
      const prompt = await pool.query<{ id: string }>(
        `INSERT INTO prompts (tenant_id, category, name, description) VALUES ($1, 'positive', 'Our voice', 'Say it like Bob') RETURNING id`,
        [tenantId]
      );
      await pool.query(
        `INSERT INTO prompt_versions (prompt_id, version, template) VALUES ($1, 1, 'Call the owner Bob')`,
        [prompt.rows[0]?.id]
      );
      await pool.query(
        `INSERT INTO platform_activity_log (type, actor_email, tenant_id, business_name)
         VALUES ('business_suspended', 'admin@example.test', $1, 'The Coastal Table')`,
        [tenantId]
      );
      await pool.query(
        `INSERT INTO platform_activity_log (type, actor_email, tenant_id, business_name, target_email)
         VALUES ('user_deactivated', 'admin@example.test', $1, 'The Coastal Table', 'bob@thecoastaltable.test')`,
        [tenantId]
      );
      return { tenantId, userId, reviewId };
    }

    describe('AuthRepository.markTenantErased', () => {
      it('replaces the free text the business left behind and keeps the numbers', async () => {
        const repo = new AuthRepository(dbService);
        const { tenantId, reviewId } = await seedBusiness();
        const { tenantId: otherTenant } = await seedBusiness();

        await expect(repo.markTenantErased(tenantId)).resolves.toEqual(
          expect.objectContaining({ name: expect.stringContaining('db-spec') })
        );

        const tenant = await pool.query(`SELECT name, status FROM tenants WHERE id = $1`, [
          tenantId,
        ]);
        expect(tenant.rows[0]).toEqual({ name: '[erased]', status: 'erased' });

        const review = await pool.query(
          `SELECT review_text, reviewer_name, external_reviewer_id, matched_keywords, rating, anonymized_at FROM reviews WHERE id = $1`,
          [reviewId]
        );
        expect(review.rows[0]).toMatchObject({
          review_text: null,
          reviewer_name: null,
          external_reviewer_id: null,
          // The business's own blocklist terms: it deletes the list itself, so a copy on every matched review must go too.
          matched_keywords: null,
          rating: 5,
        });
        expect(review.rows[0].anonymized_at).not.toBeNull();

        const response = await pool.query(
          `SELECT content, original_content, error_message FROM review_responses WHERE tenant_id = $1`,
          [tenantId]
        );
        // `original_content` is the stored copy of the AI draft, which can quote the reviewer's and the business's names.
        expect(response.rows[0]).toEqual({
          content: '[erased]',
          original_content: null,
          error_message: null,
        });

        const location = await pool.query(
          `SELECT name, address, phone, website_uri FROM locations WHERE tenant_id = $1`,
          [tenantId]
        );
        expect(location.rows[0]).toEqual({
          name: '[erased]',
          address: null,
          phone: null,
          website_uri: null,
        });

        expect(
          await count(`SELECT count(*) n FROM in_app_notifications WHERE tenant_id = $1`, [
            tenantId,
          ])
        ).toBe(0);
        expect(
          await count(`SELECT count(*) n FROM blocklist_terms WHERE tenant_id = $1`, [tenantId])
        ).toBe(0);
        const prompt = await pool.query(
          `SELECT p.name, p.description, v.template FROM prompts p JOIN prompt_versions v ON v.prompt_id = p.id WHERE p.tenant_id = $1`,
          [tenantId]
        );
        expect(prompt.rows[0]).toEqual({
          name: '[erased]',
          description: null,
          template: '[erased]',
        });

        // The activity log keeps that things happened, not whose business or which person it was about.
        const log = await pool.query(
          `SELECT type, business_name, target_email FROM platform_activity_log WHERE tenant_id = $1 ORDER BY type`,
          [tenantId]
        );
        expect(log.rows).toEqual([
          { type: 'business_suspended', business_name: '[erased]', target_email: null },
          { type: 'user_deactivated', business_name: '[erased]', target_email: '[erased]' },
        ]);

        // Another business is never touched.
        const other = await pool.query(`SELECT name, status FROM tenants WHERE id = $1`, [
          otherTenant,
        ]);
        expect(other.rows[0].name).toContain('db-spec');
        expect(other.rows[0].status).toBe('suspended');
        expect(
          await count(
            `SELECT count(*) n FROM reviews WHERE tenant_id = $1 AND review_text IS NOT NULL`,
            [otherTenant]
          )
        ).toBe(1);
        expect(
          await count(
            `SELECT count(*) n FROM platform_activity_log WHERE tenant_id = $1 AND business_name = 'The Coastal Table'`,
            [otherTenant]
          )
        ).toBe(2);
      });

      it('does nothing to a business that is not suspended, and nothing the second time', async () => {
        const repo = new AuthRepository(dbService);
        const { tenantId, reviewId } = await seedBusiness();
        await pool.query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [tenantId]);

        await expect(repo.markTenantErased(tenantId)).resolves.toBeNull();
        expect(
          await count(`SELECT count(*) n FROM reviews WHERE id = $1 AND review_text IS NOT NULL`, [
            reviewId,
          ])
        ).toBe(1);

        await pool.query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [tenantId]);
        await repo.markTenantErased(tenantId);
        await expect(repo.markTenantErased(tenantId)).resolves.toBeNull();
      });
    });

    describe('AuthRepository.anonymizeUser and the activity log', () => {
      it("blanks only that tenant's user events about that address, not an admin invited under the same one", async () => {
        const repo = new AuthRepository(dbService);
        const tenantId = await newTenant();
        const otherTenant = await newTenant();
        const email = `shared-${Math.random().toString(36).slice(2)}@example.test`;
        const user = await pool.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, name, role, status) VALUES ($1, $2, 'Bob', 'member', 'active') RETURNING id`,
          [tenantId, email]
        );
        const insertLog = (
          type: string,
          tenant: string | null,
          business: string | null
        ): Promise<unknown> =>
          pool.query(
            `INSERT INTO platform_activity_log (type, actor_email, tenant_id, business_name, target_email)
             VALUES ($1::platform_activity_type, 'admin@example.test', $2, $3, $4)`,
            [type, tenant, business, email]
          );
        await insertLog('user_deactivated', tenantId, 'Shop A');
        await insertLog('user_deactivated', otherTenant, 'Shop B');
        await insertLog('admin_invite_sent', null, null);

        await repo.anonymizeUser(user.rows[0]?.id as string);

        const rows = await pool.query(
          `SELECT type, tenant_id, target_email FROM platform_activity_log WHERE tenant_id = ANY($1::uuid[]) OR (type = 'admin_invite_sent' AND target_email = $2) ORDER BY type, business_name`,
          [[tenantId, otherTenant], email]
        );
        expect(rows.rows).toEqual([
          { type: 'admin_invite_sent', tenant_id: null, target_email: email },
          { type: 'user_deactivated', tenant_id: tenantId, target_email: '[erased]' },
          { type: 'user_deactivated', tenant_id: otherTenant, target_email: email },
        ]);
      });
    });

    describe('ReviewSyncRepository.upsertReview', () => {
      const upsert = (
        repo: ReviewSyncRepository,
        tenantId: string,
        locationId: string,
        reviewerName: string | null
      ): Promise<{ id: string }> =>
        dbService.db.transaction(tx =>
          repo.upsertReview(tx, {
            tenantId,
            locationId,
            externalReviewId: 'r-anon',
            externalReviewerId: null,
            rating: 4,
            reviewText: 'Fine',
            reviewerName,
            reviewedAt: '2026-10-01T00:00:00Z',
            externalUpdatedAt: '2026-10-02T00:00:00Z',
            status: 'new' as never,
          })
        );
      const nameOf = async (id: string): Promise<string | null> =>
        (
          await pool.query<{ reviewer_name: string | null }>(
            `SELECT reviewer_name FROM reviews WHERE id = $1`,
            [id]
          )
        ).rows[0]?.reviewer_name ?? null;

      it('does not bring back a name the retention purge or an erasure removed', async () => {
        const repo = new ReviewSyncRepository(dbService);
        const tenantId = await newTenant();
        const locationId = await newLocation(tenantId);
        const { id } = await upsert(repo, tenantId, locationId, 'Jane');
        expect(await nameOf(id)).toBe('Jane');

        await pool.query(
          `UPDATE reviews SET reviewer_name = NULL, anonymized_at = now() WHERE id = $1`,
          [id]
        );
        await upsert(repo, tenantId, locationId, 'Jane');

        expect(await nameOf(id)).toBeNull();
      });

      it('still refreshes the name on a review that was never anonymized', async () => {
        const repo = new ReviewSyncRepository(dbService);
        const tenantId = await newTenant();
        const locationId = await newLocation(tenantId);
        const { id } = await upsert(repo, tenantId, locationId, 'Jane');

        await upsert(repo, tenantId, locationId, 'Jane Q.');

        expect(await nameOf(id)).toBe('Jane Q.');
      });
    });
  });

  describe('AuthRepository — unverified sign-ups', () => {
    const repository = (): AuthRepository => new AuthRepository(dbService);

    /** A password sign-up nobody verified: a `pending_activation` tenant holding one `pending_verification` owner, `ageHours` old. */
    async function newPendingSignup(
      ageHours: number
    ): Promise<{ tenantId: string; userId: string }> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO tenants (name, status, created_at)
         VALUES ($1, 'pending_activation', now() - interval '1 hour' * $2) RETURNING id`,
        [`pending ${Math.random().toString(36).slice(2)}`, ageHours]
      );
      const tenantId = rows[0]?.id as string;
      tenants.push(tenantId);
      const user = await pool.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, name, role, status, password_hash)
         VALUES ($1, $2, 'Stranger', 'owner', 'pending_verification', 'hash') RETURNING id`,
        [tenantId, `pending-${Math.random().toString(36).slice(2)}@example.test`]
      );
      return { tenantId, userId: user.rows[0]?.id as string };
    }

    const exists = async (table: 'tenants' | 'users', id: string): Promise<boolean> =>
      (await pool.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount === 1;

    const removeOne = (
      input: { userId: string; tenantId: string },
      olderThanHours = 24
    ): Promise<boolean> =>
      repository().transaction(tx =>
        repository().deleteStalePendingSignup(tx, { ...input, olderThanHours })
      );

    describe('deleteStalePendingSignup (replacing one on a new sign-up)', () => {
      it('removes a day-old unverified sign-up, tenant and owner together', async () => {
        const signup = await newPendingSignup(25);

        await expect(removeOne(signup)).resolves.toBe(true);

        expect(await exists('tenants', signup.tenantId)).toBe(false);
        expect(await exists('users', signup.userId)).toBe(false);
      });

      it('keeps one younger than that, so a sign-up in progress is not displaced', async () => {
        const signup = await newPendingSignup(2);

        await expect(removeOne(signup)).resolves.toBe(false);

        expect(await exists('tenants', signup.tenantId)).toBe(true);
        expect(await exists('users', signup.userId)).toBe(true);
      });

      // Never a real business, however old: verified accounts and active tenants match none of the conditions.
      it('never removes a verified account or an active business, however old', async () => {
        const tenantId = await newTenant('active');
        const userId = await newUser(tenantId);
        await pool.query(
          `UPDATE tenants SET created_at = now() - interval '400 days' WHERE id = $1`,
          [tenantId]
        );

        await expect(removeOne({ tenantId, userId })).resolves.toBe(false);

        expect(await exists('tenants', tenantId)).toBe(true);
        expect(await exists('users', userId)).toBe(true);
      });

      it('never removes a tenant that has anyone else in it', async () => {
        const signup = await newPendingSignup(48);
        await pool.query(
          `INSERT INTO users (tenant_id, email, name, role, status)
           VALUES ($1, $2, 'Teammate', 'member', 'active')`,
          [signup.tenantId, `mate-${Math.random().toString(36).slice(2)}@example.test`]
        );

        await expect(removeOne(signup)).resolves.toBe(false);

        expect(await exists('tenants', signup.tenantId)).toBe(true);
      });

      it('does not trust a user id that belongs to another business', async () => {
        const stale = await newPendingSignup(48);
        const other = await newPendingSignup(48);

        await expect(removeOne({ tenantId: stale.tenantId, userId: other.userId })).resolves.toBe(
          false
        );

        expect(await exists('tenants', stale.tenantId)).toBe(true);
        expect(await exists('tenants', other.tenantId)).toBe(true);
      });
    });

    describe('deleteStalePendingSignups (the nightly sweep)', () => {
      it('removes only week-old unverified sign-ups', async () => {
        const old = await newPendingSignup(24 * 8);
        const fresh = await newPendingSignup(24 * 2);
        const activeTenant = await newTenant('active');
        await pool.query(
          `UPDATE tenants SET created_at = now() - interval '400 days' WHERE id = $1`,
          [activeTenant]
        );

        const removed = await repository().transaction(tx =>
          repository().deleteStalePendingSignups(tx, 24 * 7)
        );

        expect(removed).toBeGreaterThanOrEqual(1);
        expect(await exists('tenants', old.tenantId)).toBe(false);
        expect(await exists('users', old.userId)).toBe(false);
        expect(await exists('tenants', fresh.tenantId)).toBe(true);
        expect(await exists('tenants', activeTenant)).toBe(true);
      });
    });
  });

  describe('PlatformAdminRepository — Microsoft identities and the roster', () => {
    const repository = (): PlatformAdminRepository => new PlatformAdminRepository(dbService);

    /** Never the root: the single-root index allows only the seeded admin to have no inviter. */
    async function newAdmin(status: string): Promise<{ id: string; email: string }> {
      const inviter = await anyPlatformAdmin();
      const email = `ms-admin-${Math.random().toString(36).slice(2)}@example.test`;
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO platform_admins (email, status, invited_by_platform_admin_id)
         VALUES ($1, $2::platform_admin_status, $3) RETURNING id`,
        [email, status, inviter]
      );
      const id = rows[0]?.id as string;
      platformAdmins.push(id);
      return { id, email };
    }

    const sub = (): string => `ms-sub-${Math.random().toString(36).slice(2)}`;

    it('links an entra_id identity to the active admin holding the address, then finds it by sub for Microsoft only', async () => {
      const admin = await newAdmin('active');
      const providerUserId = sub();

      await expect(
        repository().linkIdentityByEmail({
          provider: UserIdentityProvider.ENTRA_ID,
          providerUserId,
          email: admin.email,
        })
      ).resolves.toMatchObject({ outcome: 'linked', id: admin.id });

      await expect(
        repository().findByIdentity(UserIdentityProvider.ENTRA_ID, providerUserId)
      ).resolves.toMatchObject({ id: admin.id, email: admin.email });
      // The same `sub` under Google is a different identity.
      await expect(repository().findByGoogleIdentity(providerUserId)).resolves.toBeNull();
    });

    it('never links an invited admin (an invite is redeemed through its own link) and answers disabled as unavailable', async () => {
      const invited = await newAdmin('invited');
      const disabled = await newAdmin('disabled');

      await expect(
        repository().linkIdentityByEmail({
          provider: UserIdentityProvider.ENTRA_ID,
          providerUserId: sub(),
          email: invited.email,
        })
      ).resolves.toEqual({ outcome: 'no_account' });
      await expect(
        repository().linkIdentityByEmail({
          provider: UserIdentityProvider.ENTRA_ID,
          providerUserId: sub(),
          email: disabled.email,
        })
      ).resolves.toEqual({ outcome: 'unavailable' });

      const { rows } = await pool.query(
        `SELECT 1 FROM platform_admin_identities WHERE platform_admin_id = ANY($1::uuid[])`,
        [[invited.id, disabled.id]]
      );
      expect(rows).toHaveLength(0);
    });

    it('answers no_account for an unknown address, and when the account is already linked to another admin', async () => {
      const first = await newAdmin('active');
      const second = await newAdmin('active');
      const providerUserId = sub();

      await expect(
        repository().linkIdentityByEmail({
          provider: UserIdentityProvider.ENTRA_ID,
          providerUserId,
          email: 'nobody@example.test',
        })
      ).resolves.toEqual({ outcome: 'no_account' });

      await repository().linkIdentityByEmail({
        provider: UserIdentityProvider.ENTRA_ID,
        providerUserId,
        email: first.email,
      });
      await expect(
        repository().linkIdentityByEmail({
          provider: UserIdentityProvider.ENTRA_ID,
          providerUserId,
          email: second.email,
        })
      ).resolves.toEqual({ outcome: 'no_account' });
    });

    it('reads one roster row by id, with its invite dates, exactly as the full roster lists it', async () => {
      const admin = await newAdmin('active');
      await pool.query(
        `INSERT INTO platform_admin_auth_tokens (platform_admin_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'invite', now() + interval '7 days')`,
        [admin.id, `hash-${Math.random().toString(36).slice(2)}`]
      );

      const one = await repository().findWithInviteById(admin.id);
      const fromRoster = (await repository().findAllWithInvites()).find(row => row.id === admin.id);

      expect(one).toEqual(fromRoster);
      expect(one?.inviteExpiresAt).not.toBeNull();
      await expect(
        repository().findWithInviteById('00000000-0000-0000-0000-000000000000')
      ).resolves.toBeNull();
    });
  });

  describe('AuthDbService — SSO identities per provider', () => {
    const authDb = (): AuthDbService =>
      new AuthDbService(
        new AuthRepository(dbService),
        new PromptsDbService(new PromptsRepository(dbService)),
        new TenantSubscriptionsDbService(
          new TenantSubscriptionsRepository(dbService),
          new BillingPlansRepository(dbService)
        ),
        // Recording an entry only needs the repository; the sibling DB services are for the overview reads.
        new AdminOverviewDbService(new AdminOverviewRepository(dbService), {} as never, {} as never)
      );
    const sub = (): string => `sub-${Math.random().toString(36).slice(2)}`;
    const email = (): string => `sso-${Math.random().toString(36).slice(2)}@example.test`;

    it('creates a Microsoft signup under entra_id and finds it by sub for Microsoft only', async () => {
      const service = authDb();
      const providerUserId = sub();

      const user = await service.completeSsoSignup({
        provider: SsoProvider.MICROSOFT,
        providerUserId,
        email: email(),
        name: 'Ms Owner',
        businessName: 'Contoso Bistro',
      });
      expect(user).not.toBeNull();
      tenants.push(user?.tenantId as string);

      const { rows } = await pool.query<{ provider: string }>(
        'SELECT provider FROM user_identities WHERE user_id = $1',
        [user?.id]
      );
      expect(rows).toEqual([{ provider: 'entra_id' }]);

      // The platform activity feed learns a new business joined, with the owner as the actor.
      const activity = await pool.query(
        `SELECT type, actor_email, business_name, actor_platform_admin_id FROM platform_activity_log WHERE tenant_id = $1`,
        [user?.tenantId]
      );
      expect(activity.rows).toEqual([
        {
          type: 'business_joined',
          actor_email: user?.email,
          business_name: 'Contoso Bistro',
          actor_platform_admin_id: null,
        },
      ]);

      await expect(
        service.findSsoIdentityBySub(SsoProvider.MICROSOFT, providerUserId)
      ).resolves.toMatchObject({
        kind: 'known',
        user: { id: user?.id },
      });
      // The same subject under another provider is a different person.
      await expect(
        service.findSsoIdentityBySub(SsoProvider.GOOGLE, providerUserId)
      ).resolves.toEqual({
        kind: 'unknown',
      });
    });

    it('links a Microsoft identity to a stalled password signup, activating it and dropping the unproven password', async () => {
      const service = authDb();
      const tenantId = await newTenant('pending_activation');
      const address = email();
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, name, role, status, password_hash)
         VALUES ($1, $2, 'Stalled', 'owner', 'pending_verification', 'unproven-hash') RETURNING id`,
        [tenantId, address]
      );
      const userId = rows[0]?.id as string;
      const providerUserId = sub();

      const lookup = await service.linkSsoIdentityByEmail({
        provider: SsoProvider.MICROSOFT,
        providerUserId,
        email: address,
      });

      expect(lookup).toMatchObject({ kind: 'known', firstActivation: true, user: { id: userId } });
      const user = await pool.query<{ status: string; password_hash: string | null }>(
        'SELECT status, password_hash FROM users WHERE id = $1',
        [userId]
      );
      expect(user.rows[0]).toEqual({ status: 'active', password_hash: null });
      const identity = await pool.query<{ provider: string; provider_user_id: string }>(
        'SELECT provider, provider_user_id FROM user_identities WHERE user_id = $1',
        [userId]
      );
      expect(identity.rows).toEqual([{ provider: 'entra_id', provider_user_id: providerUserId }]);
    });

    it('keeps a Google and a Microsoft identity on one user side by side', async () => {
      const service = authDb();
      const tenantId = await newTenant();
      const address = email();
      await pool.query(
        `INSERT INTO users (tenant_id, email, name, role, status) VALUES ($1, $2, 'Both', 'owner', 'active')`,
        [tenantId, address]
      );
      const shared = sub();

      await service.linkSsoIdentityByEmail({
        provider: SsoProvider.GOOGLE,
        providerUserId: shared,
        email: address,
      });
      await service.linkSsoIdentityByEmail({
        provider: SsoProvider.MICROSOFT,
        providerUserId: shared,
        email: address,
      });

      await expect(service.findSsoIdentityBySub(SsoProvider.GOOGLE, shared)).resolves.toMatchObject(
        { kind: 'known' }
      );
      await expect(
        service.findSsoIdentityBySub(SsoProvider.MICROSOFT, shared)
      ).resolves.toMatchObject({ kind: 'known' });
    });
  });

  describe('AuthRepository — owner self-service erasure', () => {
    async function state(tenantId: string): Promise<Record<string, unknown>> {
      const { rows } = await pool.query(
        `SELECT status, erasure_requested_at IS NOT NULL AS pending, erasure_requested_by_user_id AS by
         FROM tenants WHERE id = $1`,
        [tenantId]
      );
      return rows[0];
    }

    it('records who asked, refuses a tenant that is not active, and restores only for that user', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const ownerId = await newUser(tenantId);
      const otherId = await newUser(tenantId);

      await expect(
        repo.requestTenantErasureBySelf({ tenantId, requestedByUserId: ownerId })
      ).resolves.toEqual({ name: expect.any(String) });
      expect(await state(tenantId)).toEqual({ status: 'suspended', pending: true, by: ownerId });

      await expect(
        repo.requestTenantErasureBySelf({ tenantId, requestedByUserId: ownerId })
      ).resolves.toBeNull();

      // Someone else's restore does not match; the requester's does, and clears everything.
      await expect(
        repo.cancelSelfRequestedErasure({
          tenantId,
          requestedByUserId: otherId,
          gracePeriodDays: 21,
        })
      ).resolves.toBeNull();
      expect((await state(tenantId))['status']).toBe('suspended');
      await expect(
        repo.cancelSelfRequestedErasure({
          tenantId,
          requestedByUserId: ownerId,
          gracePeriodDays: 21,
        })
      ).resolves.toEqual({ name: expect.any(String) });
      expect(await state(tenantId)).toEqual({ status: 'active', pending: false, by: null });
    });

    it('cannot restore once the grace period is over, and a restore records the erasure window', async () => {
      const repo = new AuthRepository(dbService);
      const late = await newTenant();
      const lateOwner = await newUser(late);
      await repo.requestTenantErasureBySelf({ tenantId: late, requestedByUserId: lateOwner });
      await pool.query(
        `UPDATE tenants SET erasure_requested_at = now() - interval '22 days' WHERE id = $1`,
        [late]
      );

      await expect(
        repo.cancelSelfRequestedErasure({
          tenantId: late,
          requestedByUserId: lateOwner,
          gracePeriodDays: 21,
        })
      ).resolves.toBeNull();
      expect((await state(late))['status']).toBe('suspended');

      const inTime = await newTenant();
      const owner = await newUser(inTime);
      await repo.requestTenantErasureBySelf({ tenantId: inTime, requestedByUserId: owner });
      await expect(
        repo.cancelSelfRequestedErasure({
          tenantId: inTime,
          requestedByUserId: owner,
          gracePeriodDays: 21,
        })
      ).resolves.toEqual({ name: expect.any(String) });
      const { rows } = await pool.query(
        `SELECT last_erasure_requested_at IS NOT NULL AS req, last_erasure_cancelled_at IS NOT NULL AS cancelled
         FROM tenants WHERE id = $1`,
        [inTime]
      );
      expect(rows[0]).toEqual({ req: true, cancelled: true });
    });

    it('cannot restore an erasure an admin requested, and an erased tenant is untouchable', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const ownerId = await newUser(tenantId);
      await pool.query(
        `UPDATE tenants SET status = 'suspended', erasure_requested_at = now() WHERE id = $1`,
        [tenantId]
      );

      await expect(
        repo.cancelSelfRequestedErasure({
          tenantId,
          requestedByUserId: ownerId,
          gracePeriodDays: 21,
        })
      ).resolves.toBeNull();
      expect(await repo.findTenantErasureState(tenantId)).toMatchObject({
        status: 'suspended',
        erasureRequestedByUserId: null,
      });

      await pool.query(`UPDATE tenants SET status = 'erased' WHERE id = $1`, [tenantId]);
      await expect(
        repo.requestTenantErasureBySelf({ tenantId, requestedByUserId: ownerId })
      ).resolves.toBeNull();
    });

    it('keeps the delete-account code apart from the set-password one', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const userId = await newUser(tenantId);
      const expiresAt = new Date(Date.now() + 60_000).toISOString();

      await dbService.db.transaction(tx =>
        repo.putDeleteAccountOtp(tx, { userId, tokenHash: 'del-hash', expiresAt })
      );

      await expect(
        dbService.db.transaction(tx =>
          repo.consumeSetPasswordOtp(tx, { userId, tokenHash: 'del-hash' })
        )
      ).resolves.toBe(false);
      await expect(
        dbService.db.transaction(tx =>
          repo.consumeDeleteAccountOtp(tx, { userId, tokenHash: 'del-hash' })
        )
      ).resolves.toBe(true);
      await expect(
        dbService.db.transaction(tx =>
          repo.consumeDeleteAccountOtp(tx, { userId, tokenHash: 'del-hash' })
        )
      ).resolves.toBe(false);
    });
  });

  describe('AuthRepository — erasure emails', () => {
    async function pendingTenant(daysAgo: number): Promise<string> {
      const tenantId = await newTenant('suspended');
      await pool.query(
        `UPDATE tenants SET erasure_requested_at = now() - make_interval(days => $2) WHERE id = $1`,
        [tenantId, daysAgo]
      );
      return tenantId;
    }

    it('addresses only active, non-anonymized owners that are not pending removal', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await newTenant();
      const ownerId = await newUser(tenantId);
      await pool.query(`UPDATE users SET locale = 'de' WHERE id = $1`, [ownerId]);
      const member = await newUser(tenantId);
      await pool.query(`UPDATE users SET role = 'member' WHERE id = $1`, [member]);
      const disabled = await newUser(tenantId);
      await pool.query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [disabled]);
      const removing = await newUser(tenantId);
      await pool.query(`UPDATE users SET erasure_requested_at = now() WHERE id = $1`, [removing]);
      const anonymized = await newUser(tenantId);
      await pool.query(`UPDATE users SET anonymized_at = now() WHERE id = $1`, [anonymized]);

      const recipients = await repo.findTenantOwnerRecipients(tenantId);

      expect(recipients).toHaveLength(1);
      expect(recipients[0]).toMatchObject({ name: 'Spec User', locale: 'de' });
    });

    it('finds only tenants inside the reminder window that have not been reminded', async () => {
      const repo = new AuthRepository(dbService);
      const tooEarly = await pendingTenant(10);
      const inWindow = await pendingTenant(19);
      const pastDeadline = await pendingTenant(22);
      const active = await newTenant();

      const ids = (
        await repo.findTenantsDueForErasureReminder({ gracePeriodDays: 21, reminderDaysBefore: 3 })
      ).map(row => row.id);

      expect(ids).toContain(inWindow);
      expect(ids).not.toContain(tooEarly);
      expect(ids).not.toContain(pastDeadline);
      expect(ids).not.toContain(active);
    });

    it('lets exactly one run claim the reminder, and re-arms it for a later request', async () => {
      const repo = new AuthRepository(dbService);
      const tenantId = await pendingTenant(19);

      const claims = await Promise.all([
        repo.claimErasureReminder(tenantId),
        repo.claimErasureReminder(tenantId),
        repo.claimErasureReminder(tenantId),
      ]);
      expect(claims.filter(claim => claim !== null)).toHaveLength(1);

      const ownerId = await newUser(tenantId);
      await pool.query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [tenantId]);
      await repo.requestTenantErasureBySelf({ tenantId, requestedByUserId: ownerId });
      const { rows } = await pool.query(
        `SELECT erasure_reminder_sent_at FROM tenants WHERE id = $1`,
        [tenantId]
      );
      expect(rows[0].erasure_reminder_sent_at).toBeNull();
    });
  });

  describe('Stripe billing state around checkout and erasure', () => {
    async function subscriptionFor(
      tenantId: string,
      fields: {
        stripeSubscriptionId?: string | null;
        status?: string | null;
        cancelAtPeriodEnd?: boolean;
      } = {}
    ): Promise<void> {
      await pool.query(
        `INSERT INTO tenant_subscriptions (tenant_id, plan_id, stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end,
                                           current_period_start, current_period_end)
         SELECT $1, id, $2, $3, $4::subscription_status, $5, '2026-10-01', '2026-11-01' FROM billing_plans WHERE code = 'paid'`,
        [
          tenantId,
          `cus_${Math.random().toString(36).slice(2)}`,
          fields.stripeSubscriptionId === undefined
            ? `sub_${Math.random().toString(36).slice(2)}`
            : fields.stripeSubscriptionId,
          fields.status === undefined ? 'active' : fields.status,
          fields.cancelAtPeriodEnd ?? false,
        ]
      );
    }

    it('keeps the stored billing period when a checkout completes without one', async () => {
      const service = new TenantSubscriptionsDbService(
        new TenantSubscriptionsRepository(dbService),
        new BillingPlansRepository(dbService)
      );
      const tenantId = await newTenant();
      await subscriptionFor(tenantId);

      await service.setToPaidFromCheckout(tenantId, {
        stripeSubscriptionId: 'sub_new',
        status: 'active' as never,
        cancelAtPeriodEnd: false,
      });

      const { rows } = await pool.query(
        `SELECT stripe_subscription_id, current_period_start, current_period_end FROM tenant_subscriptions WHERE tenant_id = $1`,
        [tenantId]
      );
      expect(rows[0].stripe_subscription_id).toBe('sub_new');
      expect(new Date(rows[0].current_period_end as string).toISOString()).toBe(
        '2026-11-01T00:00:00.000Z'
      );
      expect(new Date(rows[0].current_period_start as string).toISOString()).toBe(
        '2026-10-01T00:00:00.000Z'
      );
    });

    it('finds only businesses waiting out an erasure whose subscription may still bill', async () => {
      const repo = new TenantSubscriptionsRepository(dbService);
      const pending = async (fields: Parameters<typeof subscriptionFor>[1]): Promise<string> => {
        const tenantId = await newTenant('suspended');
        await pool.query(`UPDATE tenants SET erasure_requested_at = now() WHERE id = $1`, [
          tenantId,
        ]);
        await subscriptionFor(tenantId, fields);
        return tenantId;
      };
      const billing = await pending({});
      const noSubscriptionYet = await pending({
        stripeSubscriptionId: null,
        status: null,
      });
      const alreadyEnding = await pending({ cancelAtPeriodEnd: true });
      const cancelled = await pending({ status: 'canceled' });
      const notPending = await newTenant('active');
      await subscriptionFor(notPending);

      const found = await repo.findPendingErasureWithBillableSubscription();

      expect(found).toEqual(expect.arrayContaining([billing, noSubscriptionYet]));
      expect(found).not.toContain(alreadyEnding);
      expect(found).not.toContain(cancelled);
      expect(found).not.toContain(notPending);
    });
  });

  describe('AuthRepository.releaseErasureReminderClaim', () => {
    it('makes the reminder claimable again, and only for a business still waiting out its grace period', async () => {
      const repo = new AuthRepository(dbService);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO tenants (name, status, erasure_requested_at, erasure_reminder_sent_at)
         VALUES ('db-spec reminder', 'suspended', now() - interval '19 days', now()) RETURNING id`
      );
      const tenantId = rows[0]?.id as string;
      tenants.push(tenantId);
      expect(await repo.claimErasureReminder(tenantId)).toBeNull();

      await repo.releaseErasureReminderClaim(tenantId);

      expect(await repo.claimErasureReminder(tenantId)).not.toBeNull();
    });
  });

  describe('billing receipts — charged after an erasure request', () => {
    function receipt(tenantId: string, invoice: string, paidAt: string) {
      return {
        tenantId,
        stripeInvoiceId: invoice,
        stripeSubscriptionId: 'sub_1',
        amountPaid: 4900,
        currency: 'usd',
        invoiceNumber: `INV-${invoice}`,
        paidAt,
      };
    }

    it('flags only a payment that succeeded after the erasure was requested, and only once', async () => {
      const repo = new BillingReceiptsRepository(dbService);
      const tenantId = await newTenant('suspended');
      await pool.query(
        `UPDATE tenants SET erasure_requested_at = '2026-09-30T12:00:00Z' WHERE id = $1`,
        [tenantId]
      );

      const before = await repo.insertIfNew(receipt(tenantId, 'in_before', '2026-09-30T11:59:00Z'));
      const after = await repo.insertIfNew(receipt(tenantId, 'in_after', '2026-09-30T12:01:00Z'));
      const replay = await repo.insertIfNew(receipt(tenantId, 'in_after', '2026-09-30T12:01:00Z'));

      expect(before).toEqual({ inserted: true, paidAfterErasureRequest: false });
      expect(after).toEqual({ inserted: true, paidAfterErasureRequest: true });
      expect(replay).toEqual({ inserted: false, paidAfterErasureRequest: false });
    });

    it('still flags a payment taken during an erasure whose webhook arrives after the cancel', async () => {
      const repo = new BillingReceiptsRepository(dbService);
      const tenantId = await newTenant();
      await pool.query(
        `UPDATE tenants SET last_erasure_requested_at = '2026-09-30T12:00:00Z',
                            last_erasure_cancelled_at = '2026-09-30T14:00:00Z' WHERE id = $1`,
        [tenantId]
      );

      const during = await repo.insertIfNew(receipt(tenantId, 'in_during', '2026-09-30T13:00:00Z'));
      const before = await repo.insertIfNew(
        receipt(tenantId, 'in_before2', '2026-09-30T11:00:00Z')
      );
      const after = await repo.insertIfNew(receipt(tenantId, 'in_after2', '2026-09-30T15:00:00Z'));

      expect(during.paidAfterErasureRequest).toBe(true);
      expect(before.paidAfterErasureRequest).toBe(false);
      expect(after.paidAfterErasureRequest).toBe(false);
    });

    it('never queues a $0 invoice as refund-due', async () => {
      const repo = new BillingReceiptsRepository(dbService);
      const tenantId = await newTenant('suspended');
      await pool.query(
        `UPDATE tenants SET erasure_requested_at = '2026-09-30T12:00:00Z' WHERE id = $1`,
        [tenantId]
      );

      const free = await repo.insertIfNew({
        ...receipt(tenantId, 'in_zero', '2026-09-30T13:00:00Z'),
        amountPaid: 0,
      });

      expect(free).toEqual({ inserted: true, paidAfterErasureRequest: false });
    });

    it('never flags a tenant with no pending erasure, or whose erasure was cancelled', async () => {
      const repo = new BillingReceiptsRepository(dbService);
      const active = await newTenant();
      const cancelled = await newTenant();
      await pool.query(`UPDATE tenants SET erasure_requested_at = NULL WHERE id = $1`, [cancelled]);

      expect(
        (await repo.insertIfNew(receipt(active, 'in_a', '2026-10-01T00:00:00Z')))
          .paidAfterErasureRequest
      ).toBe(false);
      expect(
        (await repo.insertIfNew(receipt(cancelled, 'in_c', '2026-10-01T00:00:00Z')))
          .paidAfterErasureRequest
      ).toBe(false);
    });

    it('queues flagged receipts until an admin resolves them, once', async () => {
      const receipts = new BillingReceiptsRepository(dbService);
      const admin = new AdminBillingRepository(dbService);
      const tenantId = await newTenant('suspended');
      await pool.query(
        `UPDATE tenants SET erasure_requested_at = now() - interval '1 day' WHERE id = $1`,
        [tenantId]
      );
      const adminId = await anyPlatformAdmin();

      await receipts.insertIfNew(receipt(tenantId, 'in_q', new Date().toISOString()));
      await receipts.insertIfNew({ ...receipt(tenantId, 'in_old', '2026-01-01T00:00:00Z') });
      const queue = await admin.getUnresolvedPostErasureCharges(50);
      const entry = queue.find(
        row => row.tenantId === tenantId && row.invoiceNumber === 'INV-in_q'
      );
      expect(entry).toBeDefined();
      expect(queue.some(row => row.invoiceNumber === 'INV-in_old')).toBe(false);

      const receiptId = entry?.receiptId as string;
      await expect(admin.resolvePostErasureCharge({ receiptId, adminId })).resolves.toBe(true);
      await expect(admin.resolvePostErasureCharge({ receiptId, adminId })).resolves.toBe(false);
      expect(
        (await admin.getUnresolvedPostErasureCharges(50)).some(r => r.receiptId === receiptId)
      ).toBe(false);

      const { rows } = await pool.query(
        `SELECT refund_resolved_by_admin_id AS by FROM billing_receipts WHERE id = $1`,
        [receiptId]
      );
      expect(rows[0].by).toBe(adminId);
    });
  });

  describe('TenantExportRepository', () => {
    async function reviewFor(
      tenantId: string,
      locationId: string,
      ext: string,
      name: string
    ): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO reviews (tenant_id, location_id, external_review_id, rating, review_text, reviewer_name, reviewed_at)
         VALUES ($1, $2, $3, 4, 'Great', $4, now()) RETURNING id`,
        [tenantId, locationId, ext, name]
      );
      return rows[0]?.id as string;
    }

    it('never returns another tenant’s rows, and withholds an anonymized reviewer’s name', async () => {
      const repo = new TenantExportRepository(dbService);
      const mine = await newTenant();
      const theirs = await newTenant();
      const myLocation = await newLocation(mine);
      const theirLocation = await newLocation(theirs);
      const kept = await reviewFor(mine, myLocation, 'ext-1', 'Visible Vera');
      const anon = await reviewFor(mine, myLocation, 'ext-2', 'Hidden Hank');
      await pool.query(`UPDATE reviews SET anonymized_at = now() WHERE id = $1`, [anon]);
      await reviewFor(theirs, theirLocation, 'ext-3', 'Other Tenant');
      await pool.query(
        `INSERT INTO blocklist_terms (tenant_id, term) VALUES ($1, 'mine'), ($2, 'theirs')`,
        [mine, theirs]
      );

      const reviews = await repo.listReviewsAfter({ tenantId: mine, afterId: null, limit: 50 });
      const byId = new Map(reviews.map(review => [review.id, review]));

      expect(reviews).toHaveLength(2);
      expect(byId.get(kept)?.reviewerName).toBe('Visible Vera');
      expect(byId.get(anon)?.reviewerName).toBeNull();
      expect(await repo.listBlocklist(mine)).toEqual(['mine']);
      expect((await repo.listLocations(mine)).map(location => location.id)).toEqual([myLocation]);
    });

    it('pages reviews by keyset without gaps or repeats, and attaches only that tenant’s replies', async () => {
      const repo = new TenantExportRepository(dbService);
      const tenantId = await newTenant();
      const locationId = await newLocation(tenantId);
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push(await reviewFor(tenantId, locationId, `page-${i}`, `R${i}`));
      }
      await pool.query(
        `INSERT INTO review_responses (tenant_id, review_id, response_type, content, source, status)
         VALUES ($1, $2, 'auto_reply_suggestion', 'Thanks!', 'ai_generated', 'posted')`,
        [tenantId, ids[0]]
      );

      const seen: string[] = [];
      let afterId: string | null = null;
      for (;;) {
        const page = await repo.listReviewsAfter({ tenantId, afterId, limit: 2 });
        if (page.length === 0) break;
        seen.push(...page.map(review => review.id));
        afterId = page[page.length - 1]?.id ?? null;
      }

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual(seen);

      const replies = await repo.listResponsesForReviews({ tenantId, reviewIds: ids });
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ reviewId: ids[0], content: 'Thanks!', status: 'posted' });
      expect(
        await repo.listResponsesForReviews({ tenantId: await newTenant(), reviewIds: ids })
      ).toEqual([]);
    });

    it('exports the business, team and billing without credentials or Stripe ids', async () => {
      const repo = new TenantExportRepository(dbService);
      const tenantId = await newTenant();
      await newUser(tenantId);
      await pool.query(
        `INSERT INTO billing_receipts (tenant_id, stripe_invoice_id, amount_paid, currency, invoice_number, paid_at)
         VALUES ($1, 'in_export', 4900, 'usd', 'INV-1', now())`,
        [tenantId]
      );

      const business = await repo.getBusiness(tenantId);
      const team = await repo.listTeam(tenantId);
      const billing = await repo.getBilling(tenantId);

      expect(business).toMatchObject({ status: 'active' });
      expect(team).toHaveLength(1);
      expect(Object.keys(team[0] ?? {}).sort()).toEqual([
        'createdAt',
        'email',
        'name',
        'role',
        'status',
      ]);
      expect(billing.receipts).toEqual([
        expect.objectContaining({ invoiceNumber: 'INV-1', amountPaid: 4900, currency: 'usd' }),
      ]);
      expect(JSON.stringify(billing)).not.toContain('in_export');
    });
  });

  describe('TenantSubscriptionsDbService — who cancelled', () => {
    async function subscriptionFor(tenantId: string): Promise<TenantSubscriptionsDbService> {
      const plans = new BillingPlansRepository(dbService);
      const free = await plans.findByCode('free' as never);
      await pool.query(`INSERT INTO tenant_subscriptions (tenant_id, plan_id) VALUES ($1, $2)`, [
        tenantId,
        free?.id,
      ]);
      return new TenantSubscriptionsDbService(new TenantSubscriptionsRepository(dbService), plans);
    }
    const read = async (
      tenantId: string
    ): Promise<{ cancel_at_period_end: boolean; cancellation_source: string | null }> => {
      const { rows } = await pool.query<{
        cancel_at_period_end: boolean;
        cancellation_source: string | null;
      }>(
        'SELECT cancel_at_period_end, cancellation_source FROM tenant_subscriptions WHERE tenant_id = $1',
        [tenantId]
      );
      return rows[0] as { cancel_at_period_end: boolean; cancellation_source: string | null };
    };
    const period = {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: '2026-10-01T00:00:00Z',
      currentPeriodEnd: '2026-11-01T00:00:00Z',
    };

    it('records the source with the flag, keeps it while the subscription is still ending, and clears it when it renews', async () => {
      const tenantId = await newTenant();
      const subscriptions = await subscriptionFor(tenantId);

      await subscriptions.markCancellationScheduled(
        tenantId,
        SubscriptionCancellationSource.ERASURE
      );
      expect(await read(tenantId)).toEqual({
        cancel_at_period_end: true,
        cancellation_source: 'erasure',
      });

      // The webhook that follows says "ending" — it must not wipe who asked.
      await subscriptions.syncSubscriptionFields(tenantId, { ...period, cancelAtPeriodEnd: true });
      expect((await read(tenantId)).cancellation_source).toBe('erasure');

      // Renewing (resumed in the Customer Portal, say) leaves nothing to attribute.
      await subscriptions.syncSubscriptionFields(tenantId, { ...period, cancelAtPeriodEnd: false });
      expect(await read(tenantId)).toEqual({
        cancel_at_period_end: false,
        cancellation_source: null,
      });
    });

    it('clears it when checkout starts a new subscription or the old one is deleted', async () => {
      const tenantId = await newTenant();
      const subscriptions = await subscriptionFor(tenantId);

      await subscriptions.markCancellationScheduled(tenantId, SubscriptionCancellationSource.OWNER);
      await subscriptions.setToFreeFromSubscriptionDeleted(tenantId);
      expect(await read(tenantId)).toEqual({
        cancel_at_period_end: false,
        cancellation_source: null,
      });

      await subscriptions.markCancellationScheduled(tenantId, SubscriptionCancellationSource.OWNER);
      await subscriptions.setToPaidFromCheckout(tenantId, {
        ...period,
        cancelAtPeriodEnd: false,
        stripeSubscriptionId: 'sub_db_spec',
      });
      expect(await read(tenantId)).toEqual({
        cancel_at_period_end: false,
        cancellation_source: null,
      });
    });

    it('clearCancellationScheduled undoes markCancellationScheduled', async () => {
      const tenantId = await newTenant();
      const subscriptions = await subscriptionFor(tenantId);

      await subscriptions.markCancellationScheduled(tenantId, SubscriptionCancellationSource.OWNER);
      await subscriptions.clearCancellationScheduled(tenantId);

      expect(await read(tenantId)).toEqual({
        cancel_at_period_end: false,
        cancellation_source: null,
      });
    });
  });
});
