# Database Schema Review

- **Date:** 2026-11-03
- **Scope:** `src/db/drizzle/migrations/` (`0000`–`0012`), `src/db/drizzle/schema.ts`, `src/db/drizzle/relations.ts`, `docs/schema.dbml`, and repository query patterns.
- **Method:** static review. The local PostgreSQL instance at `127.0.0.1:5432` was not running, so nothing here was verified against a live database. Run the commands in [Re-validating](#re-validating) before acting on the findings.
- **Status:** documentation-only pass. No migration, schema or application code was changed.

The migrations are the source of truth. `docs/schema.dbml` should describe what they build, not the recommended target state.

## Table inventory

29 tables across six areas:

| Area | Tables |
|---|---|
| Platform | `platform_admins`, `platform_admin_identities`, `platform_admin_auth_tokens`, `platform_settings`, `platform_activity_log` |
| Tenant & auth | `tenants`, `tenant_identity_providers`, `users`, `tenant_settings`, `blocklist_terms`, `user_identities`, `user_auth_tokens`, `refresh_tokens` |
| Review pipeline | `review_provider_connections`, `locations`, `user_locations`, `reviews`, `sync_runs`, `review_responses` |
| Prompts | `prompts`, `prompt_versions` |
| Notifications | `notification_recipients`, `notifications`, `in_app_notifications` |
| Media & billing | `media`, `billing_plans`, `tenant_subscriptions`, `stripe_webhook_events`, `billing_receipts` |

## Summary

The model is structurally sound: tenant scoping, cascade rules, partial unique indexes, check constraints and the separation of connections/locations/reviews/responses are all deliberate and coherent. No destructive or blocking defect was found.

The open items are:

1. The generated `schema.ts` index opclasses that do not match their column types.
2. Denormalized `tenant_id` columns that are not enforced against their parent row.
3. Two identity tables missing a per-provider uniqueness rule.
4. Missing FK/query indexes, plus a set of redundant indexes.
5. Tables and retention paths that are currently unused or unbounded.
6. A product-model decision: one email currently maps to exactly one tenant.

(The `platform_settings.password_login_enabled` drift from an earlier pass is fixed: the migration and
`schema.ts` both default it to `false`.)

## P1 — decide before the next schema change

### 1. `users` conflates identity with tenant membership

`users.tenant_id` is `NOT NULL` and `idx_users_email_active` (`0007_auth_hardening.sql`) makes email globally unique across tenants. A person therefore cannot belong to two tenants, while `PLAN.md` describes the agency/multi-client case as supported.

Options:

- **Keep one-tenant-per-email:** document it as a product decision and remove the contradictory PLAN.md language.
- **Support multi-tenant membership:** split `users` into an identity row and a `tenant_memberships` table carrying `tenant_id`, `role`, `status`, `invited_by_user_id` and the erasure fields.

Do not add a second nullable `tenant_id` or a join table on top of the current shape without making this choice first.

### 2. Denormalized `tenant_id` is not enforced

These tables store both a parent FK and a `tenant_id`, with no guarantee that the two agree:

- `reviews` vs `locations`
- `review_responses` vs `reviews`
- `sync_runs` vs `locations`
- `notifications` / `in_app_notifications` vs `reviews` and `users`
- `notification_recipients` vs `users`
- `locations` vs `review_provider_connections`

An inconsistent insert leaks rows across tenant filters. The durable fix is to add `UNIQUE (id, tenant_id)` on the parent and replace the single-column FKs with composite `(parent_id, tenant_id)` FKs. `user_locations` has no `tenant_id`, so it cannot be constrained this way.

This is a multi-table migration with application impact; schedule it separately rather than folding it into routine cleanup.

### 3. `schema.ts` password-login default — fixed

- Migration: `0008_platform_settings.sql` → `password_login_enabled BOOLEAN NOT NULL DEFAULT false`
- `schema.ts` → `.default(false)` (corrected; it previously said `true`)

The migration lock hashes match the files on disk, so the migration is the shipped truth. `docs/schema.dbml` and `schema.ts` now agree with it, and the API behaviour and admin Swagger examples assume `false`.

### 4. `schema.ts` contains invalid index opclasses

The introspection output assigns operator classes that do not match the column type, for example `uuid_ops` on `varchar` columns and `enum_ops` on `uuid` columns in composite indexes. This is harmless while DDL only comes from migrations, but `drizzle-kit generate`/`push` must not be used against this file. Regenerate it from a live database and re-check the opclasses.

## P2 — integrity and index hygiene

### Missing uniqueness

- `user_identities` needs `UNIQUE (user_id, provider)`.
- `platform_admin_identities` needs `UNIQUE (platform_admin_id, provider)`.

Without these, one account can link multiple identities for the same provider.

### Missing FK indexes

PostgreSQL does not index FK columns automatically, so these `ON DELETE SET NULL` paths scan the child table:

| Table.column | Notes |
|---|---|
| `tenants.active_location_id` | Location deletes |
| `in_app_notifications.notification_id` | Only relevant once `notifications` is used |
| `prompt_versions.created_by_user_id` | User deletes |
| `billing_receipts.refund_resolved_by_admin_id` | Admin deletes |

### Missing query indexes

- `reviews.reviewer_name` has no trigram index, but `listReviews` performs `ILIKE '%…%'` on it. This becomes a per-tenant sequential scan on a large table.
- `reviews (location_id, status, created_at)` would serve `findOpenReviewsForReconciliation`.
- `locations (tenant_id, status)` would serve the filtered location lists.

### Redundant indexes

Covered by a composite or unique index with the same leading column:

- `idx_reviews_tenant_id`
- `idx_reviews_location_id` (covered by unique `(location_id, external_review_id)`)
- `idx_sync_runs_location_id`
- `idx_user_locations_user_id`
- `idx_notification_recipients_tenant_id`
- `idx_review_provider_connections_tenant_id`
- `idx_notifications_review_id`
- `idx_reviews_external_reviewer_id` (no remaining query uses it)
- `idx_users_tenant_id_email` overlaps the global email uniqueness rule; keep only if tenant+email lookups need it

Do **not** remove `idx_in_app_notifications_review_id`: it serves the FK cascade.

### Missing check constraints

- `locations.google_rating` between 0 and 5
- `sync_runs.reviews_fetched` / `reviews_total` non-negative
- `billing_receipts.amount_paid` non-negative
- `media.size_bytes` positive
- `tenant_settings.review_data_retention_months` positive when set
- optional: `reviews.anonymized_at IS NULL OR (reviewer_name IS NULL AND external_reviewer_id IS NULL)`

### `updated_at` has no database owner

There are no triggers. Every table with `updated_at` depends on the repository setting it explicitly. That is consistent today, but raw SQL and one-off scripts will silently stale it. Either add one shared trigger or keep the convention documented; it is now recorded in `docs/conventions/sql-first-workflow.md`.

## P3 — unused tables and retention

| Table | Status | Recommendation |
|---|---|---|
| `notifications` | No application reads or writes; all live notifications use `in_app_notifications`. | Drop it until email/Teams delivery exists, or fold in-app delivery into it as a channel when that lands. |
| `notification_recipients` | Wired to the settings API but gated behind `notificationSettingsEnabled` (default false). | Keep as the real preference surface. |
| `user_locations` | Write-only: inserted on location confirm, never read; reads scope through `users.tenant_id`. | Keep as planned multi-location groundwork, but either start using it for member scoping or keep the write-only status explicit. |
| `tenant_identity_providers` | Intentionally unused until directory-wide SSO is required. | Keep. Note that erasure does not delete these rows, so the global unique `(provider, provider_tenant_id)` would block re-binding the same directory later. |
| `sync_runs` | Written per sync job, never purged. | Add a retention/purge job. |
| `stripe_webhook_events` | Has an idempotency-retention delete path. | No action. |

## Consolidation guidance

Recommended:

1. Drop or fold `notifications`; keeping two notification tables with one unused is the main structural debt.
2. Keep `user_identities`/`platform_admin_identities` and `user_auth_tokens`/`platform_admin_auth_tokens` separate. They serve two principal hierarchies with different FK targets and purpose enums; a polymorphic table would lose referential integrity for little gain.
3. Keep `tenant_settings` separate from `tenants`; it avoids widening the hot tenant row and keeps the export boundary clear.
4. Keep `billing_plans`/`tenant_subscriptions`/`billing_receipts` separate — catalog, current state, immutable ledger.
5. Keep `prompts`/`prompt_versions` and `reviews`/`review_responses` as they are; the append-only and 1:N shapes are correct.

Not recommended: collapsing the auth/identity tables, merging billing tables, or folding settings into `tenants`.

## Documentation drift corrected in this pass

- `docs/schema.dbml`: `platform_admin_invites` → `platform_admin_auth_tokens`.
- `docs/schema.dbml`: `password_reset_tokens` → `user_auth_tokens`.
- `docs/schema.dbml`: `password_login_enabled` default corrected to `false`.
- `docs/schema.dbml`: added `created_at`/`updated_at` and the missing `tenant_id` index to `tenant_identity_providers`.
- `docs/schema.dbml`: added notes for the global email uniqueness rule, the one-tenant-per-user limitation, missing identity uniqueness, unused/write-only tables, and the missing `sync_runs` retention.
- `docs/conventions/sql-first-workflow.md`: documented `updated_at` ownership and added this review as the known-deviations pointer.

Still stale, but in code/API files rather than docs:

- `src/api/connections/swagger/connections.swagger.ts` still says locations are read through `user_locations`; the repository now scopes by `users.tenant_id`.

## Re-validating

With the database running:

```bash
pnpm db:migrations:verify
pnpm db:migrate
pnpm db:introspect
git diff src/db/drizzle/schema.ts src/db/drizzle/relations.ts
```

Then compare the regenerated `schema.ts` with the migrations and update `docs/schema.dbml` by hand. Treat any `schema.ts` default that disagrees with a migration as a finding, not as a source of truth.
