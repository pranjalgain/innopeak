# Changelog

All notable changes to this boilerplate are documented in this file.

---

## [2.1.0] — AWS-Emulated Local Stack (Floci)

A second, parallel local dev stack for projects targeting AWS in production — toggled by a single
`DEPLOYMENT_TARGET=local|aws` env var, verified end-to-end against a live
[Floci](https://floci.io) instance (real Postgres/Redis behind RDS/ElastiCache emulation, real
SQS). See [README's "AWS-Emulated Local Stack (Floci)" section](./README.md#aws-emulated-local-stack-floci)
for full details.

### Added

- **`docker-compose.floci.yml`** — swaps `postgres-db`/`redis` for one `floci` service;
  Prometheus/Grafana/Loki/Jaeger stay unchanged in both modes.
- **`infra/floci/`** — Terraform provisioning RDS, ElastiCache, 5 SQS queues + matching `-dlq`
  queues, S3, Secrets Manager, and IAM, against Floci only (never the default/staging/production
  stack).
- **Queue Transport Pattern** — `QueuePublisherProvider` (abstract) with `BullMqQueuePublisher`/
  `SqsQueuePublisher` concretes, and `SqsQueueConsumerBase` (long-polling loop mirroring BullMQ's
  `@Processor` dispatch) with one `*-sqs.consumer.ts` per queue. Selected by `QueueTransportModule`
  based on `DEPLOYMENT_TARGET`. Business-logic classes (`*-queue.service.ts`) needed zero changes.
- **Secrets Manager hydration** (`src/config/secrets-bootstrap.ts`) — a dynamic-`import()` gate in
  `main.ts`/`worker.main.ts` fetches one JSON secret and populates `process.env` before
  `AppModule`/`WorkerModule` are `require()`'d, working around `app.module.ts`'s
  module-evaluation-time `ConfigService` construction.
- **Dev-tools "SQS Queues" panel** (`/dev-tools/queues`) — read-only queue/DLQ depth visibility for
  `aws` mode, since Bull Board has no SQS equivalent.
- **AWS endpoint override** (`getAwsEndpointOverride()`/`getFlociCredentials()` in
  `src/common/helpers/aws-endpoint.util.ts`) — shared by every AWS SDK client construction (S3,
  SES, SNS, SQS, Secrets Manager) to point at Floci instead of real AWS.

### Changed

- **`src/main.ts`/`src/worker.main.ts` split into thin entry points** — bootstrap logic moved to
  new `src/bootstrap.ts`/`src/worker-bootstrap.ts` files so the entry points could become a
  secrets-hydration gate without a giant diff.
- **`dotenv` promoted from `devDependencies` to `dependencies`** — `main.ts`/`worker.main.ts` now
  load `.env` explicitly at the top (see Fixed below), which ships in the compiled entry point.

### Fixed

All of the following were caught by actually running Terraform against a live Floci instance end
to end (provisioning real infra, booting the app, publishing/consuming real SQS messages) — none
were visible to unit tests, `tsc`, or lint:

- **`.env` wasn't loaded before the secrets-hydration check** — `hydrateSecretsIfNeeded()` reads
  `process.env['DEPLOYMENT_TARGET']` directly, but nothing had loaded `.env` into `process.env` yet
  at that point (`ConfigModule.forRoot()`'s own dotenv loading only happens once `AppModule` is
  imported, which is after the hydration gate). Fixed by calling `dotenv.config()` explicitly at
  the top of `main.ts`/`worker.main.ts`, before the hydration check.
- **AWS SDK clients threw `CredentialsProviderError` against Floci** — Floci accepts any
  credentials, but the AWS SDK v3's default credential provider chain still throws if none are
  configured. Fixed by adding `getFlociCredentials()` (dummy static credentials, used only when
  `DEPLOYMENT_TARGET=aws`) to every AWS SDK client construction.
- **Terraform's `aws_elasticache_cluster` doesn't support Redis** — real AWS (and Floci) require
  `aws_elasticache_replication_group` for Redis/Valkey; `aws_elasticache_cluster` is
  memcached-only and fails with `InvalidParameterValue: Engine must be 'memcached'`.
- **RDS's `address` attribute returned a Docker-internal bridge IP**, unreachable from a host-run
  app — fixed by using `"localhost"` (the app connects from the host, same as `POSTGRES_HOST` in
  the default stack) plus the actual Floci-assigned port.
- **ElastiCache's `primary_endpoint_address` was `null` on Floci** for this single-node,
  non-cluster-mode replication group (real AWS populates it; Floci only populates
  `configuration_endpoint_address` here) — fixed with `coalesce()` between the two attributes.
- **`TransformInterceptor` (global) broke the dev-tools "SQS Queues" panel** — it wraps every
  `@Render()`-decorated handler's return value in an `ApiResponse` envelope, burying `isAws`/
  `queues` one level too deep for the pug template's top-level locals. Fixed by switching
  `showQueues()` to the same manual `@Res()` + `res.render()` pattern already used by
  `showTools()` in the same controller (matching how `HealthController`'s equivalent route is
  instead handled via an explicit `TransformInterceptor` exclusion for `/health`).

---

## [2.0.0] — Security, testing & code-quality hardening

This release focused on making the boilerplate genuinely production-ready: a clean security
scan, a real test suite, a working lint pipeline, and cleaner API contracts. No new business
modules were added — the module list is unchanged from v1.0.0.

> [!TIP]
> New here? Jump to [`README.md`](./README.md) for the full picture, or
> [`docs/MODULE_REMOVAL_GUIDE.md`](./docs/MODULE_REMOVAL_GUIDE.md) if you want to strip modules
> you don't need.

### Added

- **Unit test suite** — 839 tests across ~103 `*.spec.ts` files (Jest + `ts-jest`), covering every
  service, controller, guard, provider, repository, interceptor, middleware, and processor in
  `src/`. The repository previously shipped with **zero** tests.
- **Pre-commit hooks** (Husky) — every commit now runs, in order: Gitleaks secret scan → Trivy
  vulnerability/misconfig scan → `tsc --noEmit` → `eslint` → `nest build` (API + worker). See
  `.husky/pre-commit` and the `security:*` scripts in `package.json`.
- **ESLint flat config** (`eslint.config.js`) — replaces the legacy `.eslintrc.js`, required for
  ESLint 9. Preserves the exact same ruleset, with a scoped override for `*.spec.ts` files
  disabling rules that only produce noise against Jest mocks (`unbound-method`,
  `no-unsafe-assignment`/`-member-access`/`-call`, `explicit-function-return-type`).
- **Response DTOs** for `src/api/tracing/` and `src/api/health/` — previously inline
  `interface`/`type` declarations in the controller/service files, now proper `dto/` classes with
  `@ApiProperty()` decorators, consistent with every other module's convention. Also extracted
  `OAuthProfile` (`src/auth/interfaces/oauth-profile.interface.ts`) and `AuditLogOptions`
  (`src/common/audit/interfaces/audit-log-options.interface.ts`) out of inline declarations.
- **[`docs/MODULE_REMOVAL_GUIDE.md`](./docs/MODULE_REMOVAL_GUIDE.md)** — a file-by-file guide for
  stripping optional modules (RBAC, AI/RAG, social OAuth, SMS, media, webhooks, audit,
  notifications, gateway, export) out of the boilerplate for leaner projects.
- **`LICENSE`** — MIT license file (package.json already declared `MIT`; the file didn't exist).
- **README "Dependency override exceptions"** section documenting the one remaining
  `pnpm.overrides` entry and exactly when to remove it.

### Changed

<details>
<summary><strong>Dependency upgrades</strong> (all direct — click to expand)</summary>

All bumped directly in `package.json`, no `pnpm.overrides` used except where noted:

| Package | From | To |
|---|---|---|
| `@nestjs/*` | various | `11.1.28` line (matching major) |
| `@opentelemetry/auto-instrumentations-node` | 0.64 | 0.78 |
| `@opentelemetry/sdk-node` | 0.205 | 0.220 |
| `@opentelemetry/context-async-hooks` | 2.1 | 2.9 |
| `@opentelemetry/resources` | 2.1 | 2.9 |
| `@opentelemetry/api` | 1.9.0 | 1.9.1 |
| `@opentelemetry/exporter-trace-otlp-proto` | 0.205 | 0.220 |
| `@aws-sdk/client-{s3,ses,sns}` + `s3-request-presigner` | 3.89x | 3.1089.0 |
| `drizzle-orm` | 0.45.1 | 0.45.2 |
| `handlebars` | 4.7.8 | 4.7.9 |
| `joi` | 18.0.1 | 18.2.3 |
| `body-parser` | 2.2.0 | 2.3.0 |
| `nodemailer` | 8.0.1 | 9.0.3 |
| `firebase-admin` | 13.6.1 | 14.2.0 |
| `uuid` | 8.3.2 | 11.1.1 (also forced via `pnpm.overrides` — see [README](./README.md#dependency-override-exceptions)) |

</details>

- **`fcm.provider.ts`** migrated to firebase-admin v14's modular API
  (`initializeApp`/`cert` from `firebase-admin/app`, `getMessaging` from
  `firebase-admin/messaging`) — the old namespace-style `admin.messaging()`/`admin.credential`
  API was removed from firebase-admin's main entry point in v14.
- **Push-notification device identification migrated from FCM registration tokens to Firebase
  Installation IDs (FIDs)** — firebase-admin's `MulticastMessage`/`tokens` is deprecated in favor
  of `FidMulticastMessage`/`fids`. Renamed end-to-end:
  - `device_tokens.token` column → `device_tokens.fid` (schema + migration SQL updated in place,
    no new migration file — this is boilerplate with no production data)
  - `NotificationsRepository.registerDeviceToken` → `.registerDeviceFid`
  - `NotificationsRepository.findDeviceTokens` → `.findDeviceFids`
  - `NotificationsRepository.deactivateDeviceToken` → `.deactivateDeviceFid`
  - `RegisterDeviceTokenDto` → `RegisterDeviceFidDto` (`token` field → `fid`)
  - `PushNotificationPayload.tokens` → `.fids`
  - `INotificationJob.deviceTokens` → `.deviceFids`
- **Dockerfile hardened** — runs as non-root `USER node` (with `--chown` on every `COPY` layer and
  a pre-created, correctly-owned `logs/` directory), and a `HEALTHCHECK` against `/health` was
  added.
- **`pnpm-workspace.yaml`** — removed `link-workspace-packages`/`prefer-workspace-packages`
  (these are `.npmrc` settings, not valid `pnpm-workspace.yaml` keys — a pre-existing mistake);
  moved to `.npmrc` where they're already partially present.
- **Health indicators migrated off `@nestjs/terminus`'s deprecated `HealthIndicator`/
  `HealthCheckError`** (removed in the next Terminus major) to the current `HealthIndicatorService`
  API — `src/redis/redis.health.ts`, `src/api/health/custom-http-health.indicator.ts`,
  `src/api/health/custom-database-health.indicator.ts`. As a side effect, this also fixes a latent
  bug where a custom indicator's own `status` data field (e.g. an HTTP status code) could silently
  overwrite the real up/down status — the new API's types make that a compile error.
- **`openai.provider.ts`** — `max_tokens` (deprecated, incompatible with o-series/reasoning
  models) replaced with `max_completion_tokens`.
- **`tsconfig.json`** — added explicit `rootDir: "./src"` and `ignoreDeprecations: "5.0"` to
  silence forward-looking TS 7.0 deprecation warnings about `baseUrl`/`moduleResolution: "Node"`
  (a full migration to `paths`-without-`baseUrl` + `Node16`/`Bundler` resolution is a larger,
  separate effort — this only silences the warning without changing current, tested behavior).

### Fixed

> [!IMPORTANT]
> Every fix below was verified with a live Docker build/run against real Postgres/Redis
> containers, not just unit tests — see the Testing section in `README.md`.

- **56 dependency vulnerabilities** resolved via direct upgrades (12 critical, 15 high, 27 medium,
  4 low, as reported by `trivy fs --scanners vuln`) — see [Changed](#changed) above for the
  version bumps. Two residual findings (both `CVE-2026-41907` in `uuid`, pulled in transitively by
  `exceljs` and by `firebase-admin`'s `@google-cloud/storage` dependency chain) have no upstream
  fix yet and are resolved via a documented `pnpm.overrides` entry (see README).
- **Dockerfile misconfigurations** (Trivy `DS-0002` running as root, `DS-0026` missing
  `HEALTHCHECK`) — both fixed.
- **Removed unused `@nestjs/devtools-integration` dependency** — its `DevtoolsModule` was already
  commented out in `app.module.ts` (never actually registered), yet the package was still
  installed and was the sole source of 10 CRITICAL/MEDIUM sandbox-escape CVEs via its
  `@nyariv/sandboxjs` dependency.
- **A latent production bug**: `multer` was imported directly in
  `src/media/interceptors/file-upload.interceptor.ts` but was never declared in
  `package.json` (only worked locally via incidental pnpm hoisting). This crashed with
  `Cannot find module 'multer'` on a clean install (caught via a live Docker container run) —
  added as an explicit direct dependency.
- **~2,000 ESLint issues** fixed across ~190 files after the flat-config migration exposed rules
  that had never actually run under the old, broken ESLint 9 + legacy-config combination
  (`no-explicit-any`, `no-floating-promises`, `no-unsafe-*`, missing return types, etc.).
- **`transform.interceptor.ts`** — fixed an `exactOptionalPropertyTypes` violation where
  `error: data?.error || null` couldn't type-check against `ApiResponse.error?: string`; now
  conditionally spreads the `error` key only when present.
- **`cookies.middleware.ts`** — fixed a crash (`Cannot read properties of undefined (reading
  'sid')`) on every request without a `Cookie` header. `cookie-parser` middleware is never
  registered in this app, so `req.cookies` is genuinely `undefined` at runtime; an earlier pass of
  this same lint-remediation effort had removed the defensive `req.cookies?.[...]` optional
  chaining as "unnecessary" based on a misleading type cast. Caught and fixed via a live Docker
  smoke test before landing.
- **`error-handler.service.ts`** — fixed a generic type mismatch in `createErrorResponse<T>`
  (`data ?? null` has type `NonNullable<T> | null`, not assignable to bare `T`); return type
  widened to `ApiResponse<T | null>`.
- **`pnpm-workspace.yaml` schema errors** — `Property link-workspace-packages is not allowed` /
  `Property prefer-workspace-packages is not allowed` (see [Changed](#changed)).

### Removed

- `@nestjs/devtools-integration` (unused, and the source of 10 sandbox-escape CVEs).
- `@types/uuid` (uuid ships its own TypeScript types since v9; having both installed is
  redundant/stale).

---

## [1.0.0] — Initial release

Initial NestJS 11 enterprise boilerplate:

| Module | What it does |
|---|---|
| 🔑 **Auth** | JWT access/refresh tokens with rotation, Google/GitHub OAuth (Apple stub), API keys, TOTP-based MFA, RBAC (roles + permissions) |
| 👤 **Users** | CRUD with role assignment |
| 📁 **Media** | File uploads via S3 or Cloudinary (swappable provider) |
| ✉️ **Email** | Templated email via SMTP or SES (swappable provider), Handlebars templates |
| 📱 **SMS** | SMS + OTP via Twilio or SNS (swappable provider) |
| 🔔 **Notifications** | Multi-channel (FCM push + in-app), device registration |
| 🪝 **Webhooks** | Outbound webhooks with HMAC-SHA256 signatures, BullMQ-backed retry delivery |
| 🤖 **AI** | Claude/OpenAI provider abstraction, pgvector-backed RAG pipeline, agent framework with tool calling |
| 🔌 **Gateway** | WebSocket support via Socket.IO |
| 📝 **Audit** | Application-level audit logging |
| 📤 **Export** | CSV/PDF/Excel data export |
| 📊 **Infrastructure** | Health checks, Prometheus metrics, OpenTelemetry tracing, developer tools dashboard — all versioned separately from business routes (`VERSION_NEUTRAL`) |
| ⚙️ **Background** | BullMQ queues (email, notification, webhook, dead-letter) + cron jobs |
| 🗄️ **Data layer** | Drizzle ORM (SQL-first migrations) + PostgreSQL, centralized repository pattern |
| 📈 **Observability** | Prometheus + Grafana, Jaeger, Loki, Winston structured logging |
