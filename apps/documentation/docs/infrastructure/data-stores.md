---
sidebar_position: 4
---

# Data Stores

InnoPeak keeps its data in two places: **PostgreSQL**, the system of record, and **Redis**, which holds
the working state that makes the application fast and safe. Both are required to start. This page
covers versions, connections, persistence and backup for each.

## PostgreSQL

### Requirements

| Requirement | Detail |
|---|---|
| Version | **18 or newer.** Table defaults use the built-in `uuidv7()`, which PostgreSQL 18 introduced. No migration defines it |
| Extensions | `pg_trgm`, created by migration `0002_tenant_auth.sql`. The migrating user needs permission to create it (it is a trusted extension, so the database owner can) |
| Encoding and time | Timestamps are stored as `timestamptz`. The application sets no session time zone |
| Network | Reachable from the API, the worker and the migration job. Nothing else needs it |

The local Docker stack uses PostgreSQL 18. The Terraform for the emulated AWS stack asks for 17, which
has not been checked against the migrations. See [Environments](./environments.md).

### Connections

Each process (API and worker) opens its own pool. The settings are in the
[Configuration reference](../services/configuration-reference.md#database).

| Setting | Default | Meaning |
|---|---|---|
| `DB_POOL_MAX` | 10 | Maximum connections for one process |
| `DB_IDLE_TIMEOUT_MS` | 30000 | An idle connection is closed after this |
| `DB_CONNECTION_TIMEOUT_MS` | 5000 | How long to wait for a free connection |
| `DB_STATEMENT_TIMEOUT_MS` | 30000 | A query running longer is cancelled |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED` | off | TLS to the database and certificate verification |

**Connections needed = (API replicas + worker replicas) x `DB_POOL_MAX`**, plus headroom for the
migration job and for people connecting by hand. For example, 2 API replicas and 2 workers at the
default of 10 need 40 connections. Keep that under the database's `max_connections` with room to spare,
and lower `DB_POOL_MAX` before adding replicas if it would not fit. If a connection pooler such as
PgBouncer is put in front, use session pooling: the nightly erasure purge takes session-level advisory
locks.

The process exits at start-up if the database is unreachable, so a wrong `DATABASE_URL` stops a rollout
instead of replacing a working instance.

### Migrations

- Migrations are plain SQL in `apps/backend/src/db/drizzle/migrations`, numbered `0000` to `0012` today.
- Apply them from the built output with `pnpm db:migrate:prod`, **once per release, before the new
  version takes traffic**. See [Deployment and releases](./deployment-and-releases.md).
- Until the first production release a migration can still be edited in place and re-baselined with
  `pnpm db:migrations:lock`. **From the first release on, a released migration is immutable**:
  `pnpm db:migrations:verify` fails if one changed, and every schema change is a new numbered file. An
  edited migration is a silent no-op on any database that already applied it.
- The first platform admin is created with `pnpm db:seed:admin:prod`.

### What grows

The data that grows with use is reviews and their replies, sync runs, notifications, the platform
activity log and billing receipts. The application removes some of it itself:

| Data | Removed by |
|---|---|
| Used or expired codes, expired refresh tokens, unverified sign-ups | The nightly auth-token cleanup |
| Read notifications after 90 days, unread after 180 | The nightly notification purge |
| Stripe webhook records after 90 days | The nightly billing sweep |
| Reviewer names and ids, after a business's retention period | The nightly reviewer retention purge |
| A whole business and its data | The nightly erasure purge, after the grace period |

Reviewer names and ids are personal data, and a deletion request must be honoured within the grace
period. The database's region is therefore a compliance question, not only a latency one. See
[Open items](./open-items.md).

## Redis

### What it holds

Redis is not a disposable cache here. It carries state the application relies on:

| Held in Redis | If it is lost |
|---|---|
| **Queued jobs** (BullMQ, for every queue except those on SQS, and always for `review-sync`) | Waiting jobs disappear. Polls re-derive from Google on the next 15-minute cycle. A reply that was approved but not yet posted stays approved, and the owner can retry it |
| **Rate-limit counters** | Counters reset to zero, so everyone briefly gets a full allowance |
| **Sign-out and password-change marks** | A signed-out access token works until it expires, up to 15 minutes |
| **Login and one-time-code attempt budgets** | Budgets reset, so a locked account is unlocked |
| **Google, Microsoft and Google-connect round-trip state** (short-lived) | Sign-ins and connections in flight fail and are repeated |
| **Live notification channel** (publish and subscribe) | Open browsers fall back to polling |
| **The job-id deduplication keys used with SQS** | Duplicate scheduled ticks are possible for a few minutes |
| **Google refresh tokens, outside production** (`review-credentials:*`, encrypted, no expiry) | **Every owner must reconnect Google.** In production these live in Secrets Manager instead |

### Requirements

| Requirement | Why |
|---|---|
| Persistence on (append-only file, or the provider's equivalent) | So a restart does not drop queued jobs and, outside production, the Google tokens. The local stack runs with append-only persistence |
| **Eviction policy `noeviction`** | BullMQ stores its jobs as ordinary keys and breaks if Redis evicts them. Some managed services default to an evicting policy, so set it explicitly |
| A password (`REDIS_PASSWORD`) | Required to start. Also set `REDIS_TLS_ENABLED=true` for any managed service reached over a network |
| Modest memory | Counters, marks and queue metadata are small, and finished jobs are trimmed on a schedule: an hour for completed polls, a day for most queues, a week for review posts, 60 days for failed dead-letter entries. Size from observed use |

The application keeps one client per process, and the API opens a second for the live notification
stream. BullMQ builds its own connections from the same settings, one per queue and one blocking
connection per worker, so a process holds several. This is far below any default `maxclients` limit,
but count them when sizing a managed plan that caps connections.

## Backups and recovery

The application cannot back itself up. None of this is defined in the repository, and it is tracked in
[Open items](./open-items.md).

| Item | Recommendation | Decision needed |
|---|---|---|
| PostgreSQL | Managed backups with point-in-time recovery turned on, and a **restore tested before launch** | Recovery point and recovery time objectives (RPO and RTO) |
| Redis | Persistence on. Treat a full loss as survivable in production (queued jobs re-derive) and as a forced re-connect for owners outside production | Whether to snapshot Redis at all |
| Secrets | Held in the secrets store, not the repository. Keep a documented way to recreate each | Owner and rotation schedule. See [Secrets and access](./secrets-and-access.md) |
| Uploaded avatars | Stored by Cloudinary, outside this system | Cloudinary's own retention |
