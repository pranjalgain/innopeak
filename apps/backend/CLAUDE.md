# CLAUDE.md — NestJS 11 Enterprise Boilerplate

## Tech Stack

NestJS 11, TypeScript 5.9 (very strict), Drizzle ORM (SQL-first), PostgreSQL, Redis (ioredis), BullMQ, pnpm 8.15.0. AWS SDK v3 clients (SES/SQS/Secrets Manager) for both real AWS and the Floci-emulated local stack (see `DEPLOYMENT_TARGET` below).

## Commands

```bash
pnpm start:dev              # Start API + Worker (concurrently)
pnpm type-check             # TypeScript strict check (run before committing)
pnpm lint                   # ESLint with auto-fix
pnpm test                   # Unit tests (Jest)
pnpm test:e2e               # E2E tests
pnpm local:up               # Full local setup: docker + migrate + start
pnpm db:migrate             # Apply SQL migrations
pnpm db:introspect          # Generate Drizzle schema from DB
pnpm db:create-migration <name>  # Create new empty SQL migration file
pnpm db:studio              # Open Drizzle Studio
pnpm local:aws:up           # AWS-emulated stack: Floci + Terraform + start (DEPLOYMENT_TARGET=aws)
```

## TypeScript Strictness

The project uses maximum strictness. Key implications:

- `exactOptionalPropertyTypes` — cannot assign `undefined` to optional properties; use `?? defaultValue`
- `noUnusedLocals` / `noUnusedParameters` — prefix unused params with `_`
- `noUncheckedIndexedAccess` — array/object index access returns `T | undefined`
- `noPropertyAccessFromIndexSignature` — use bracket notation for index signatures
- `ConfigService.get<T>()` returns `T | undefined` — always use `?? defaultValue`

## Database (Drizzle ORM — SQL-First Workflow)

**Never use Drizzle Kit to generate migrations. Write raw SQL.**

1. Create migration: `pnpm db:create-migration <name>`
2. Write SQL in `src/db/drizzle/migrations/XXXX_<name>.sql`
3. Update journal: `src/db/drizzle/migrations/meta/_journal.json`
4. Apply: `pnpm db:migrate`
5. Regenerate schema: `pnpm db:introspect`
6. Schema output: `src/db/drizzle/schema.ts`

**Tables** (in migration order — `src/db/drizzle/migrations/*.sql` is the source of truth):

| Migration | Tables |
|-----------|--------|
| `0000_foundation` | audit_logs |
| `0001_platform_admin` | platform_admins, platform_admin_identities, platform_admin_invites |
| `0002_tenant_auth` | tenants, tenant_identity_providers, users, tenant_settings, blocklist_terms, user_identities, password_reset_tokens |
| `0003_review_provider_locations` | review_provider_connections, notification_recipients, locations, user_locations |
| `0004_reviews` | reviews, sync_runs, review_responses |
| `0005_notifications` | notifications |
| `0006_prompts` | prompts, prompt_versions (`template VARCHAR(1000)`) |
| `0007_auth_hardening` | refresh_tokens |
| `0008_dev_platform_admin` | No tables. Seeds the root `platform_admins` row — the one identity with no other creation path (`idx_platform_admins_single_root` allows one NULL-inviter row; every later admin is invited). Seeds no tenant: an owner comes from `POST /v1/auth/signup` + `verify-email`. Journaled, so it applies everywhere — read its header before deploying |

**Schema changes are edited into the original migration file**, not added as a follow-up `ALTER`.
Nothing is deployed, so a local database is recreated rather than upgraded. The catch: drizzle's
migrator walks `meta/_journal.json` by `when` timestamp and never re-reads an applied file, so an
edited migration is a **silent no-op** on any existing database — `pnpm db:migrate` reports success
and changes nothing. After pulling a change to an existing migration, recreate your database
(`pnpm backend:down && pnpm backend:up`, then `pnpm db:migrate`).

## Path Aliases (baseUrl: ./src)

```
@common/*  @config/*  @db/*  @redis/*  @otel/*  @bg/*  @auth/*  @email/*
@metrics/*  @health/*  @middlewares/*  @interceptors/*  @logger/*  @cron/*
@email-queue/*  @dead-letter-queue/*
```

`@auth/*` resolves to `api/auth/*`, `@metrics/*`/`@health/*` to `api/metrics/*`/`api/health/*`.
`tsconfig.json` and `jest.config.ts` still declare `@users/*`, `@media/*`, `@sms/*`,
`@notifications/*` and `@notification-queue/*`, but those directories no longer exist — nothing
imports them, don't add new imports through them.

## Architecture Patterns

### Repository + DB Service Pattern (Centralized under src/db/)
**Target convention (all new modules) — four layers, not three:**
```
Controller (HTTP layer only) -> Service (business logic) -> DB Service (data-layer abstraction)
                                                           -> Repository (Drizzle queries only)
                             -> Provider (external services)
```
A `<Module>DbService` sits between the business Service and the Repository — it's what the
Service actually depends on for data access (composes repository calls, owns multi-repository
transactions, maps rows to domain types), while the Repository stays purely mechanical (one
table/cluster, raw Drizzle queries, no composition). A Service never imports a Repository
directly and never runs a Drizzle query itself. Don't confuse `<Module>DbService` with the
existing global `DBService` (`src/db/db.service.ts`) — that's the raw connection holder a
Repository injects, one layer below. Full detail + worked example:
`apps/backend/docs/conventions/module-structure.md`.

Both the Repository and the DB Service live in `src/db/repositories/<domain>/`, centralized
(not inside the business module). The global `DBModule` registers and exports both, so any
business module can inject any domain's DB Service without cross-module coupling.

**Repository location**: `src/db/repositories/<domain>/<name>.repository.ts`
**DB Service location**: `src/db/repositories/<domain>/<name>.db-service.ts`
**Import pattern**: `import { UsersDbService } from '@db/repositories/users/users.db-service'`

**Status**: `src/db/repositories/auth/` is the only repository domain that exists, and it already
follows the four-layer shape (`auth.repository.ts` + `auth.db-service.ts`) — use it as the
reference. New modules follow the same convention from the start.

### Provider/Strategy Pattern
External integrations use abstract base classes with swappable implementations:
- Email (`src/email/providers/`): `EmailProvider` -> SmtpProvider / SesProvider / NoopProvider
- Auth verification codes (`src/api/auth/providers/`): `VerifyEmailTokenProvider` ->
  RandomVerifyEmailTokenProvider / FixedVerifyEmailTokenProvider (the latter only when
  `DEV_VERIFY_EMAIL_TOKEN` is set outside production)
- Queue transport (`src/background/providers/`) — see Queue Transport Pattern below

Provider selection is done via factory in module registration, so services never branch on
environment themselves. Worked example: `apps/backend/docs/conventions/provider-pattern.md`.

### Queue Transport Pattern (BullMQ / SQS)
Same abstract-provider shape as above, for the background-job transport:
- `QueuePublisherProvider` (abstract, `src/background/providers/queue-publisher.provider.ts`) — `BullMqQueuePublisher` (local) / `SqsQueuePublisher` (aws)
- `SqsQueueConsumerBase` (abstract, `src/background/providers/sqs-queue-consumer.base.ts`) — long-polling loop mirroring BullMQ's `@Processor` dispatch; concrete `*-sqs.consumer.ts` files implement `process(jobName, data)`
- Selected by `QueueTransportModule` based on `DEPLOYMENT_TARGET` (`local` | `aws`) — imported by both `BackgroundModule` (worker) and `QueueUIModule` (API)
- Business-logic classes (`*-queue.service.ts`) are transport-agnostic; only producers (`*.queue.ts`) and consumers change

### Module Structure (follow for every new domain module)

**All new module APIs live under `src/api/<module_name>/`** (not directly under `src/<module>/`
— that's the older, pre-convention location several existing modules still use, see "Existing
Modules" below).

```
src/api/<module>/                      # Business logic module (HTTP layer + orchestration)
  swagger/
    <module>.swagger.ts                # ALL Swagger decorators for this controller, composed
                                        # via applyDecorators(...) — one file per controller, one
                                        # decorator per route in the controller itself. Never
                                        # inline @ApiOperation/@ApiResponse on the controller.
  constants/
    <module>.constants.ts              # Module-local constants only — NOT user-facing messages
  types/
    <name>.type.ts                     # Module-local domain types/interfaces
  dto/                                 # class-validator + class-transformer + @nestjs/swagger —
                                        # every @ApiProperty needs an `example`, no exceptions
  providers/
    <abstract>.provider.ts             # Abstract base class
    <impl>.provider.ts                 # Concrete implementation(s)
  <module>.module.ts
  <module>.controller.ts               # HTTP layer ONLY: bind params, call one service method,
                                        # wrap with ResponseUtil, return. No computation.
  <module>.service.ts                  # Business logic — depends on DB Service(s)/Provider(s),
                                        # never a Repository directly.

src/db/repositories/<module>/          # Data access (separate from business module)
  <module>.repository.ts               # Drizzle queries only
  <module>.db-service.ts               # <Module>DbService — abstraction between Service and
                                        # Repository, see "Repository + DB Service Pattern" above
```

If a module has more than one controller or more than one business service, group them into
`controllers/`/`services/` subfolders (with matching `swagger/<controller-name>.swagger.ts` per
controller) instead of flat files at the module root. Every method on every layer declares an
explicit return type — never inferred, never `any`.

**Messages**: every user-facing string (exception messages, custom success messages passed to
`ResponseUtil.success`) comes from `src/common/constants/messages.constants.ts` (create it the
first time a module needs it) — never an inline literal.

**Docs first**: write `apps/documentation/docs/backend/<module>/overview.md` +
`api-reference.md` (mirror `apps/documentation/docs/backend/auth/`) and get them confirmed
*before* writing code — see "Module Development Workflow" in the root `CLAUDE.md`.

Full convention with a worked end-to-end example (controller, swagger file, service, DB service,
repository, DTOs): `apps/backend/docs/conventions/module-structure.md`.

### Existing Modules

This is the complete list — the boilerplate modules the branch history mentions (users, media,
sms, notifications, webhooks, gateway, ai, common/audit, common/export) have all been **deleted**,
along with their repositories, tables and seed data. Don't reference them; a new module of any of
those kinds starts fresh under `src/api/<module_name>/`, per "Module Structure" above.

| Module | Path | Purpose |
|--------|------|---------|
| Auth | `src/api/auth/` | Tenant signup/login, OTP email verification, JWT access + rotating refresh tokens (data access in `src/db/repositories/auth/`) |
| Email | `src/email/` | Templated emails (SMTP/SES/Noop, Handlebars) — predates the `src/api/` convention |
| Health | `src/api/health/` | Health checks (DB, Redis, memory, HTTP) — under `src/api/`, but predates the swagger/constants/types subfolder convention |
| Metrics | `src/api/metrics/` | Prometheus metrics |
| Tracing | `src/api/tracing/` | OpenTelemetry distributed tracing |
| Dev Tools | `src/api/dev-tools/` | Developer tools dashboard (+ SQS queue-depth panel in `aws` mode) |
| Background | `src/background/` | BullMQ email + dead-letter queues and cron jobs (SQS in `aws` mode — see Queue Transport Pattern) |

## Auth System

Lives in `src/api/auth/` (data access in `src/db/repositories/auth/`). Full behaviour + route
contract: `apps/documentation/docs/backend/auth/`.

**Flows** (`/v1/auth/...`, all `@Public()`)
- `signup` — creates the tenant + its first user (role `owner`) and emails a 6-digit OTP; no
  tokens issued yet
- `verify-email` — consumes the OTP, activates the user, issues the first token pair;
  `resend-verification-otp` re-sends a fresh one
- `login` — password check first, then status: an unverified account gets a
  "pending verification" response plus a new OTP, a verified one gets tokens
- `refresh` / `logout` — refresh token read from its httpOnly cookie, never from the body

**Tokens**
- Access token: JWT, 15 min (`ACCESS_TOKEN_TTL_SECONDS`). Sent both as an httpOnly `access_token`
  cookie (scoped `/`) and in the JSON body, so browsers and `Bearer`-header clients both work
- Refresh token: opaque random 32 bytes, 7 days, stored only as a sha256 hash in `refresh_tokens`,
  httpOnly cookie scoped to `/v1/auth`. Single-use rotation on every refresh; a reuse of an
  already-spent token revokes every refresh token for that user
- Every JWT carries a `type` claim (`tenant_user` | `platform_admin` | `refresh`) —
  `JwtStrategy` rejects anything else rather than defaulting to a tenant user

**Authorization**
- Global guard order: ThrottlerGuard -> JwtAuthGuard -> RolesGuard (no permissions layer — the
  boilerplate `PermissionsGuard`/`@Permissions()`/`@ApiKeyAuth()` and the roles/permissions
  tables are gone)
- Tenant user roles are exactly `owner` and `member` — a column on `users`, not an RBAC table
- `@Public()` — skips the JWT guard
- `@Roles(UserRole.OWNER, UserRole.MEMBER)` — OR logic (any listed role matches). Takes `UserRole`
  members, not string literals: the parameter is typed `UserRole[]` so a raw literal is a compile
  error rather than a value that silently never matches. A platform-admin token has no `role` at
  all and fails closed on any `@Roles()` route
- `@CurrentUser()` — param decorator for the authenticated `AuthUser` (a discriminated union:
  narrow on `type` before trusting `tenantId`/`role`)
- Infrastructure endpoints (health, metrics, tracing, dev-tools) use `@Public()` to bypass JWT

## Conventions

### Naming
- Files: `kebab-case` (`user.service.ts`, `create-user.dto.ts`)
- Classes: `PascalCase` (`UserService`, `CreateUserDto`)
- Route names: centralized in `src/common/route-names.ts` (RouteNames enum)

### Controllers
- Business controllers: `@Controller({ path: RouteNames.X, version: '1' })` — URI versioning at `/v1/...`
- Infrastructure controllers (health, metrics, tracing, dev-tools): `@Controller({ path: RouteNames.X, version: VERSION_NEUTRAL })` — no version prefix (`/health`, `/metrics`)
- Always use `RouteNames` enum for controller paths — never raw strings
- No business logic, no computation — bind params, call exactly one service method, wrap the
  result with `ResponseUtil` (`src/common/helpers/response.utils.ts`), return it
- Every route carries exactly one Swagger decorator, composed in that controller's
  `swagger/<name>.swagger.ts` — never inline `@ApiOperation`/`@ApiResponse`/etc. on the method
- Register all route slugs in `src/common/route-names.ts`
- Every method declares an explicit return type (e.g. `Promise<ApiResponse<PaymentResponseDto>>`)

### Services
- Orchestrate DB Service(s) and Provider(s) (Facade pattern)
- No direct DB calls, no Repository import — go through the module's `<Module>DbService`
- Every method declares an explicit return type

### DB Services (new layer — `src/db/repositories/<domain>/<name>.db-service.ts`)
- The abstraction a Service depends on for data access — composes Repository calls, owns any
  transaction spanning more than one Repository call, maps rows to domain `types/`
- No business rules, no Provider calls — still data-layer, just above raw queries
- Not the same class as the global `DBService` (`src/db/db.service.ts`, the raw connection
  holder) — a `<Module>DbService` injects `<Module>Repository`, not `DBService` directly

### DTOs
- Use `class-validator` decorators for validation
- Use `class-transformer` for transformation
- Use `@nestjs/swagger` decorators (`@ApiProperty()`/`@ApiPropertyOptional()`) for API docs —
  every property needs an `example`, no exceptions

### Repositories
- Only place that imports from `@db/*` and runs Drizzle queries
- One repository per domain module, one table/tightly-related cluster per method — no
  cross-repository composition (that's the DB Service's job)

### Messages
- Every user-facing string (exception messages, custom success messages) comes from
  `src/common/constants/messages.constants.ts` — never an inline literal in a controller,
  service, or DB service

## Deployment Target (Floci/AWS emulation)

Single env var `DEPLOYMENT_TARGET` (`local` | `aws`) toggles between the default self-hosted stack
(`docker-compose.yml`) and an AWS-emulated one (`docker-compose.floci.yml` + [Floci](https://floci.io),
a LocalStack-compatible emulator with **real** Postgres/Redis behind its RDS/ElastiCache emulation).
Terraform for the emulated stack lives in `infra/floci/` (never touches local/staging/production).
In `aws` mode: queues go through SQS (see Queue Transport Pattern), secrets are hydrated from AWS
Secrets Manager at boot (`src/config/secrets-bootstrap.ts`, via a dynamic-`import()` gate in
`main.ts`/`worker.main.ts` — required because `app.module.ts` builds a `ConfigService` at
module-evaluation time), and S3/SES/SNS clients get an `endpoint` override
(`getAwsEndpointOverride()` in `@common/helpers/aws-endpoint.util.ts`). Metrics/logs/tracing are
**unchanged** in both modes — no CloudWatch integration. Full details: README's
"AWS-Emulated Local Stack (Floci)" section.

## Dev Tools & Observability

| Tool | URL | Purpose |
|------|-----|---------|
| Swagger v1 | `localhost:3000/api/v1` | API v1 documentation |
| Swagger | `localhost:3000/api` | Redirects to latest version |
| Bull Board | `localhost:3000/admin/queues` | Queue management |
| Prometheus | `localhost:9090` | Metrics |
| Grafana | `localhost:3001` | Dashboards |
| Jaeger | `localhost:16686` | Distributed tracing |
| Loki | `localhost:3100` | Log aggregation |

## Common Pitfalls

1. **ConfigService returns undefined** — `configService.get('KEY')` is `T | undefined`. Always provide a fallback: `configService.get('PORT') ?? 3000`
2. **Index access is `T | undefined`** — Due to `noUncheckedIndexedAccess`. Check before using: `const item = arr[0]; if (item) { ... }`
3. **Optional properties** — Due to `exactOptionalPropertyTypes`, you cannot do `{ prop: undefined }` on optional fields. Omit the key instead or use a type union `prop?: string | undefined`
4. **Migration journal** — After creating a SQL migration file, the journal at `meta/_journal.json` must have a matching entry. `pnpm db:create-migration` handles this automatically.
5. **pnpm may not be on PATH** — Use `npx` as fallback if `pnpm` is not found
6. **Worker process** — The app runs API and Worker concurrently. Worker entrypoint is `src/worker.main.ts`, which is a thin secrets-hydration gate — actual bootstrap logic lives in `src/worker-bootstrap.ts` (API equivalent: `src/main.ts` -> `src/bootstrap.ts`)
7. **Path aliases in production builds** — `@common/*`, `@config/*`, etc. only resolve at runtime via `tsconfig-paths/register` (dev mode) or Nest's dev-server tooling. A plain compiled build (`nest build` / `tsc`) leaves them as literal `require('@logger/logger.service')` calls, which crash with `MODULE_NOT_FOUND` under `node dist/main.js` — `build:api`/`build:worker` run `tsc-alias -p tsconfig.build.json` after compiling specifically to rewrite them to relative paths. Don't remove that step.
8. **`nest start --watch` needs `tsconfig-paths` registered at runtime too, and its incremental cache can wedge itself** — `nest start --watch` (unlike `build:api`) never runs `tsc-alias`, so without help it crashes the same way as pitfall #7 the moment it runs the compiled output (`Cannot find module '@config/secrets-bootstrap'`, etc.). Fixed by `api:start`/`api:start:dev`/`api:start:debug` setting `NODE_OPTIONS="-r tsconfig-paths/register" TS_NODE_BASEURL=./dist` — the `TS_NODE_BASEURL` override matters because `tsconfig.json`'s `baseUrl` points at `./src`, wrong for resolving aliases inside compiled `dist/` output. Separately: `tsconfig.build.json` (what both `nest build` and `nest start --watch` compile through) has `"incremental": false` — inheriting `tsconfig.json`'s `incremental: true` was observed (on Node v24.16.0) to leave `tsconfig.build.tsbuildinfo` in a state where the compiler reports "0 errors" but silently emits nothing, and every subsequent build stays broken until that file is deleted by hand. If a project or Node upgrade fixes this upstream, both overrides can be revisited — until then, don't remove either without reproducing a clean `pnpm start:dev` boot first.
