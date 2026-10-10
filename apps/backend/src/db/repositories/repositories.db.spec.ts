import { SsoProvider } from '@auth/constants/sso-auth.constants';
import { SubscriptionCancellationSource } from '@common/enums/subscription-cancellation-source.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { AdminBillingRepository } from './admin-billing/admin-billing.repository';
import { AdminBusinessesRepository } from './admin-businesses/admin-businesses.repository';
import { AdminUsersRepository } from './admin-users/admin-users.repository';
import { AuthDbService } from './auth/auth.db-service';
import { AuthRepository } from './auth/auth.repository';
import { BillingPlansRepository } from './billing/billing-plans.repository';
import { BillingReceiptsRepository } from './billing/billing-receipts.repository';
import { TenantSubscriptionsDbService } from './billing/tenant-subscriptions.db-service';
import { TenantSubscriptionsRepository } from './billing/tenant-subscriptions.repository';
import { ConnectionsRepository } from './connections/connections.repository';
import { PromptsDbService } from './prompts/prompts.db-service';
import { PromptsRepository } from './prompts/prompts.repository';
import { ReviewSyncRepository } from './review-sync/review-sync.repository';
import { BlocklistTermsRepository } from './settings/blocklist-terms.repository';
import { TenantExportRepository } from './tenant-export/tenant-export.repository';

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
  });

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
        `INSERT INTO password_reset_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, 'h2', 'verify_email', now() + interval '1 day')`,
        [userId]
      );

      expect((await repo.anonymizeUser(userId)).outcome).toBe('anonymized');

      const counts = await pool.query(
        `SELECT (SELECT count(*) FROM refresh_tokens WHERE user_id = $1)::int AS refresh,
                (SELECT count(*) FROM password_reset_tokens WHERE user_id = $1)::int AS reset`,
        [userId]
      );
      expect(counts.rows[0]).toEqual({ refresh: 0, reset: 0 });
      expect((await repo.anonymizeUser(userId)).outcome).toBe('already_anonymized');
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
        )
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
      const { rows: admins } = await pool.query<{ id: string }>(
        `SELECT id FROM platform_admins LIMIT 1`
      );
      const adminId = admins[0]?.id as string;

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
