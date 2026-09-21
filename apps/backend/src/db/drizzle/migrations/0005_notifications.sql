-- Migration: notifications
-- Google Business Profile Review Management — notifications module
-- Source of truth: apps/backend/docs/PLAN.md + apps/backend/docs/schema.dbml
-- Depends on: 0000_foundation.sql (enum types), 0002_tenant_auth.sql
--   (tenants, users), 0004_reviews.sql (reviews)
--
-- ⚠ RECREATE YOUR DATABASE AFTER PULLING THIS CHANGE.
-- Per the repo convention this file is edited in place rather than followed by an ALTER
-- migration, and drizzle's migrator never re-reads a file it has already applied — on an existing
-- database `pnpm db:migrate` reports success and changes nothing. `in_app_notifications` (added
-- below) is what `GET /v1/notifications` reads; a stale database has no such table and that route
-- fails at runtime, not at migrate time.
--   pnpm backend:down && pnpm backend:up && pnpm db:migrate

-- ───────────────────────────────────────────────────────────────────────
-- notifications — depends on: tenants, reviews, users
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    generation_group_id UUID,
    -- `notification_type` has exactly one value today.
    type notification_type NOT NULL DEFAULT 'escalation',
    channel notification_channel NOT NULL,
    -- Queued before it is dispatched; sent/failed are terminal updates.
    status notification_status NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_tenant_id ON notifications(tenant_id);
CREATE INDEX idx_notifications_review_id ON notifications(review_id);
CREATE INDEX idx_notifications_recipient_user_id ON notifications(recipient_user_id);
CREATE INDEX idx_notifications_generation_group_id ON notifications(generation_group_id);

-- Scoped to (..., generation_group_id) rather than just (review_id, recipient_user_id, type) —
-- see PLAN.md §8.13. A review can legitimately escalate more than once over its lifetime (e.g.
-- superseded and reclassified per §8.6/§8.12); each escalation gets its own generation_group_id,
-- so this still blocks a duplicate/retried send within one escalation event without permanently
-- blocking every escalation after the first for that review. Relies on generation_group_id being
-- reliably populated for the 'escalation' notification_type (Postgres treats NULLs in a unique
-- index as distinct from each other, so a NULL here would silently stop being deduplicated at all).
CREATE UNIQUE INDEX idx_notifications_review_recipient_type ON notifications(review_id, recipient_user_id, type, generation_group_id);

-- ───────────────────────────────────────────────────────────────────────
-- in_app_notifications — depends on: tenants, users, reviews, notifications
--
-- The in-app notification centre's own table — deliberately separate from `notifications` above,
-- which is a per-channel delivery ledger (see this module's own docs,
-- apps/documentation/docs/backend/notifications/overview.md, "Gap § 1" for the full reasoning a
-- comment here can only summarize): `notifications` has no `title`/`description`, a NOT NULL
-- `review_id`, a single-value `type`, one row per channel rather than per event, and a `read_at`
-- that means email-open telemetry, not a user clicking "mark as read" in the dashboard. None of
-- that fits a feed a signed-in user reads and acknowledges themselves.
-- ───────────────────────────────────────────────────────────────────────

CREATE TYPE in_app_notification_type AS ENUM (
    'review_escalated',
    'reply_needs_approval',
    'reply_approved',
    'connection_issue'
);

CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- ON DELETE CASCADE, unlike notifications.recipient_user_id's RESTRICT: a feed row has no
    -- audit value worth blocking a user delete over, unlike a delivery record.
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Its own enum, not notification_type — so the feed's four event kinds never force
    -- notification_type (and by extension notification_recipients.notification_type) to grow
    -- values that have no delivery/preference meaning.
    type in_app_notification_type NOT NULL,
    -- Frozen at creation, composed from src/common/constants/messages.constants.ts at write time —
    -- a later wording change must never rewrite history.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    -- Nullable, unlike notifications.review_id: connection_issue has no review to point at.
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    -- Optional back-link to the delivery row this feed entry accompanies (NULL for feed-only
    -- types with no email/Teams leg). ON DELETE SET NULL: losing the delivery record must not
    -- delete the user's feed entry for it.
    notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
    -- Bare nullable UUID, no FK — same shape as on notifications and review_responses. Present so
    -- the dedupe index below can tell a re-escalation (new group id) from a redelivered retry
    -- (same group id) apart, the same distinction PLAN.md §8.13 makes for notifications.
    generation_group_id UUID,
    -- The real, first-party read timestamp. NULL = unread. Nothing but PATCH .../:id/read (or
    -- read-all) ever writes it — unlike notifications.read_at, nothing external can populate it.
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_in_app_notifications_tenant_id ON in_app_notifications(tenant_id);
CREATE INDEX idx_in_app_notifications_review_id ON in_app_notifications(review_id);
-- Serves GET /v1/notifications: "this user's rows, newest first". id (uuidv7, monotonic with
-- creation time) breaks ties within the same escalation fan-out, which can share a created_at to
-- the microsecond.
CREATE INDEX idx_in_app_notifications_user_created ON in_app_notifications(user_id, created_at DESC, id DESC);
-- Partial index for a future unreadOnly filter / unread-count query — not used by the route this
-- migration ships (see the API reference's own note on why there's no separate unread-count
-- route), added now because retrofitting it onto a populated table later costs a full index build
-- this one avoids.
CREATE INDEX idx_in_app_notifications_user_unread ON in_app_notifications(user_id) WHERE read_at IS NULL;
-- Same shape and same NULL-distinctness caveat as idx_notifications_review_recipient_type
-- (PLAN.md §8.13): a connection_issue row has both review_id and generation_group_id NULL, so
-- Postgres never deduplicates those — correct here, since each incident is a fresh notice, not a
-- retry of the same one.
CREATE UNIQUE INDEX idx_in_app_notifications_dedupe ON in_app_notifications(user_id, type, review_id, generation_group_id);
