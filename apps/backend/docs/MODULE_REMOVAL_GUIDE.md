# Module Removal Guide

This boilerplate ships with every optional module wired in and turned on. If your project doesn't
need all of them, this guide tells you exactly what to delete and what to edit — file paths,
import lines, method names, database tables — so nothing is left half-removed.

**How to use this guide**: pick a concern below, follow its four steps in order (delete files →
edit registrations → drop DB tables → remove env vars), then run `pnpm type-check` — TypeScript
will immediately surface any import you missed. Finish with `pnpm lint:check` and `pnpm test`.

**General rules for every removal below:**

1. **Never edit historical migration files.** Migrations under `src/db/drizzle/migrations/` are a
   permanent, ordered record. To drop tables, create a **new** migration
   (`pnpm db:create-migration drop_<concern>`) with `DROP TABLE IF EXISTS ...` statements, and add
   the corresponding entry to `src/db/drizzle/migrations/meta/_journal.json`. Only skip this step
   if the database has never been deployed (fresh local boilerplate with no real data) — in that
   case it's simpler to edit the original `CREATE TABLE` migration directly and re-run
   `pnpm db:migrate` against a fresh database.
2. **Always remove the matching Drizzle schema exports** in `src/db/drizzle/schema.ts` (the
   `pgTable(...)` definition and its `relations(...)` companion) — leaving them in with no backing
   table will break `pnpm db:introspect` and any repository that still imports them.
3. **Run `pnpm type-check` after every section**, not just at the end. Path aliases mean a stray
   import will fail loudly and immediately, which is the fastest way to catch anything this guide
   missed.
4. **Remove the corresponding npm packages** from `package.json` only after confirming (via
   `grep -rn "package-name" src`) that nothing else in the codebase still imports them — several
   packages are shared across concerns (see the "shared package" notes inline below).
5. **Update `docs/conventions/`, `CLAUDE.md`, and this file** if the removal changes a
   convention documented there (e.g. the guard order, the module list).

---

## Table of contents

1. [RBAC (roles & permissions)](#1-rbac-roles--permissions)
2. [AI / RAG / Agents](#2-ai--rag--agents)
3. [Social OAuth (Google / GitHub / Apple)](#3-social-oauth-google--github--apple)
4. [SMS](#4-sms)
5. [Media / file uploads](#5-media--file-uploads)
6. [Webhooks](#6-webhooks)
7. [Audit logging](#7-audit-logging)
8. [Notifications (push / in-app)](#8-notifications-push--in-app)
9. [Gateway (WebSocket / Socket.IO)](#9-gateway-websocket--socketio)
10. [Data export (CSV/PDF/Excel)](#10-data-export-csvpdfexcel)
11. [AWS-Emulated Local Stack (Floci)](#11-aws-emulated-local-stack-floci)

---

## 1. RBAC (roles & permissions)

<details>
<summary><strong>1. RBAC (roles & permissions)</strong> — removes role/permission checks, leaving plain JWT authentication</summary>

Removes role/permission checks entirely, leaving plain JWT authentication (any authenticated user
can call any route not behind a deleted guard).

### Delete these files

```
src/auth/guards/roles.guard.ts
src/auth/guards/roles.guard.spec.ts
src/auth/guards/permissions.guard.ts
src/auth/guards/permissions.guard.spec.ts
src/auth/decorators/roles.decorator.ts        # @Roles(), ROLES_KEY
src/auth/decorators/permissions.decorator.ts  # @Permissions(), PERMISSIONS_KEY
```

### Edit these files

- **`src/app.module.ts`** — remove the `RolesGuard`/`PermissionsGuard` imports and their two
  `{ provide: APP_GUARD, useClass: RolesGuard }` / `useClass: PermissionsGuard` entries in
  `providers`. Update the guard-order comment. The remaining chain is
  `ThrottlerGuard → JwtAuthGuard`.
- **`src/auth/auth.module.ts`** — remove `RolesGuard`/`PermissionsGuard` from `providers`/`exports`.
- **`src/users/users.controller.ts`** — remove the `Roles` import and the three `@Roles('admin')`
  decorators.
- **`src/users/users-v2.controller.ts`** — same: remove `Roles` import and its three
  `@Roles('admin')` usages.
- **`src/notifications/notifications.controller.ts`** — remove the single `@Roles('admin')` usage
  (only relevant if you're keeping Notifications — see §8).
- **`src/auth/interfaces/jwt-payload.interface.ts`** and **`auth-user.interface.ts`** — remove the
  `roles: string[]` / `permissions: string[]` fields. The JWT payload becomes just
  `{ sub, email, iat?, exp? }`.
- **`src/auth/auth.service.ts`** — `register()`/`login()` call
  `authRepository.getUserWithRolesAndPermissions()` and assign the default `'user'` role on
  registration; replace with a plain user lookup that returns `{ id, email }` only.
- **`src/auth/services/oauth.service.ts`** (only if keeping OAuth — see §3) — remove the
  `oauthRepository.assignDefaultRole(userId)` and `.loadUserWithRolesAndPermissions(userId)` calls.
- **`src/db/repositories/auth/auth.repository.ts`** and **`oauth.repository.ts`** — delete the
  `getUserWithRolesAndPermissions` / `loadUserWithRolesAndPermissions` / `assignDefaultRole`
  methods (they join `roles`/`userRoles`/`rolePermissions`/`permissions`).
- **`src/db/repositories/users/users.repository.ts`** — strip the `roles`/`userRoles` joins from
  `findById`, `findByEmail`, and the list-with-roles helper; drop `roles` from the returned shape.
- **`src/db/seeds/001_roles_permissions.sql`** — delete (or stop invoking it from
  `pnpm db:seed`'s `seed.sh`).

### Database

Drop tables: `roles`, `permissions`, `user_roles`, `role_permissions`
(created in `0003_create_roles_permissions.sql`, seeded in `0008_seed_roles_permissions.sql`).

Remove from `src/db/drizzle/schema.ts`: `roles`, `rolesRelations`, `permissions`,
`permissionsRelations`, `userRoles`, `userRolesRelations`, `rolePermissions`,
`rolePermissionsRelations`, and the `userRoles: many(userRoles)` line inside `usersRelations`.

### Env vars

None — RBAC has no dedicated environment configuration.

### What's left

`ThrottlerGuard → JwtAuthGuard` only. `@CurrentUser()` still works and returns `{ id, email }`.
API keys and MFA are untouched (they're independent of RBAC).

</details>

---

## 2. AI / RAG / Agents

<details>
<summary><strong>2. AI / RAG / Agents</strong> — removes the self-contained Claude/OpenAI, RAG, and agent framework module</summary>

The most self-contained module in the boilerplate — **nothing outside `src/ai/**` imports from
it**, so this is the cleanest removal on this list.

### Delete these files

```
src/ai/                                  # entire directory: ai.module.ts, ai.service.ts,
                                          # agents/**, rag/**, providers/**, dto/**, interfaces/**
src/db/repositories/ai/agents.repository.ts
src/db/repositories/ai/rag.repository.ts
```

### Edit these files

- **`src/app.module.ts`** — remove `import { AgentsModule } from './ai/agents/agents.module'` and
  `AgentsModule` from `imports` (the `// AI Agents` block).
- **`src/main.ts`** — remove the same `AgentsModule` import and drop it from the `V1_MODULES`
  array used for per-version Swagger doc generation.
- **`src/common/route-names.ts`** — remove `AI = 'ai'`.
- **`src/db/db.module.ts`** — remove the `AgentsRepository`/`RagRepository` imports and their
  entries in the `repositories` array.

### Database

Drop tables: `documents`, `document_chunks`, `conversations`, `messages`
(`0011_create_vector_store.sql`, `0012_create_conversations.sql`). If nothing else in your project
uses pgvector similarity search, also drop the extension: `DROP EXTENSION IF EXISTS vector;`.

Remove from `schema.ts`: `documents`, `documentsRelations`, `documentChunks`,
`documentChunksRelations`, `conversations`, `conversationsRelations`, `messages`,
`messagesRelations`. No other table has a foreign key into these — safe to drop wholesale.

### Env vars

Remove: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_DEFAULT_MODEL`,
`OPENAI_EMBEDDING_MODEL`, `AI_DEFAULT_PROVIDER`, `AGENT_API_ALLOWED_DOMAINS`. Also remove the
matching fields from `src/config/env.config.ts`.

### Packages to remove

`@anthropic-ai/sdk`, `openai` — confirm with `grep -rn "@anthropic-ai/sdk\|from 'openai'" src`
that nothing else imports them first.

### Cross-module coupling

None. `DatabaseTool` (`src/ai/agents/tools/database.tool.ts`) uses `DBService` generically for
read-only queries — no other module depends on it.

</details>

---

## 3. Social OAuth (Google / GitHub / Apple)

<details>
<summary><strong>3. Social OAuth (Google / GitHub / Apple)</strong> — removes social login, keeping email/password + JWT</summary>

Leaves email/password login, JWT rotation, MFA, and API keys untouched.

### Delete these files

```
src/auth/strategies/google-oauth.strategy.ts (+ .spec.ts)
src/auth/strategies/github-oauth.strategy.ts (+ .spec.ts)
src/auth/strategies/apple-oauth.strategy.ts (+ .spec.ts)   # unimplemented placeholder, never registered
src/auth/services/oauth.service.ts (+ .spec.ts)
src/auth/dto/oauth-callback.dto.ts
src/auth/interfaces/oauth-profile.interface.ts
src/db/repositories/auth/oauth.repository.ts (+ .spec.ts)
```

### Edit these files

- **`src/auth/auth.module.ts`** — remove the `OAuthService`, `GithubOAuthStrategy`,
  `GoogleOAuthStrategy` imports and their `providers` entries.
- **`src/auth/auth.controller.ts`** — remove the entire Google block (`googleAuth()`,
  `googleAuthCallback()`) and GitHub block (`githubAuth()`, `githubAuthCallback()`), plus the
  `OAuthProfile` import.
- **`src/db/db.module.ts`** — remove the `OAuthRepository` import and its `repositories` entry.

### Database

Drop table: `oauth_accounts` (`0007_create_oauth_accounts.sql`). Remove from `schema.ts`:
`oauthAccounts`, `oauthAccountsRelations`, and the `oauthAccounts: many(oauthAccounts)` line in
`usersRelations`.

### Env vars

Remove: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
`APPLE_PRIVATE_KEY`.

### Packages to remove

`passport-google-oauth20`, `passport-github2`, `@types/passport-google-oauth20`,
`@types/passport-github2`.

### Cross-module coupling

`OAuthService.findOrCreateOAuthUser` calls into RBAC (`assignDefaultRole`,
`loadUserWithRolesAndPermissions`) — see §1 if you're removing both together. No other coupling.

</details>

---

## 4. SMS

<details>
<summary><strong>4. SMS</strong> — removes SMS/OTP delivery via Twilio or SNS</summary>

### Delete these files

```
src/sms/                     # entire directory: sms.module.ts, sms.service.ts,
                              # interfaces/sms.interface.ts, providers/**
```

### Edit these files

- **`src/app.module.ts`** — remove `import { SmsModule } from './sms/sms.module'` and `SmsModule`
  from `imports` (the `// SMS` block). This is the *only* place outside `src/sms/**` that
  references it.

### Database

None — OTPs are stored transiently in Redis (`cacheManager`, key prefix `sms:otp:`), not in
Postgres. No migration to write.

> [!NOTE]
> `mfa_settings.type` allows `'sms'` in its check constraint alongside `'totp'`
> (`0006_create_mfa.sql`), but no code path currently implements SMS-based MFA
> (`src/auth/services/mfa.service.ts` only does TOTP) — removing SMS does not break MFA. You may
> optionally tighten the constraint to `IN ('totp')` in a follow-up migration, but it's harmless
> to leave as-is.

### Env vars

Remove: `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`,
`AWS_SNS_SENDER_ID`. **Do not** remove `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` if
Media (S3) or Email (SES) are still in use — those three vars are shared across all AWS-backed
providers.

### Packages to remove

`twilio`, `@aws-sdk/client-sns` — confirm `@aws-sdk/client-sns` isn't used elsewhere first (as of
this guide, only `src/sms/providers/sns.provider.ts` uses it).

### Cross-module coupling

None — `SmsModule` is `@Global()` but nothing outside `src/sms/**` injects `SmsService`.

</details>

---

## 5. Media / file uploads

<details>
<summary><strong>5. Media / file uploads</strong> — removes S3/Cloudinary file upload support</summary>

### Delete these files

```
src/media/                    # entire directory: media.module.ts, media.controller.ts (+spec),
                               # media.service.ts (+spec), dto/**, interceptors/** (+spec),
                               # interfaces/media.interface.ts, providers/** (+specs)
src/db/repositories/media/media.repository.ts (+ .spec.ts)
```

### Edit these files

- **`src/app.module.ts`** — remove `import { MediaModule } from './media/media.module'` and
  `MediaModule` from `imports`.
- **`src/main.ts`** — remove the same import and drop `MediaModule` from `V1_MODULES`.
- **`src/common/route-names.ts`** — remove `MEDIA = 'media'`.
- **`src/db/db.module.ts`** — remove the `MediaRepository` import and its `repositories` entry.
- **`src/background/constants/job.constant.ts`** — `QueueName.MEDIA_UPLOAD` and
  `JobName.BG_UPLOAD_MEDIA` are defined but **already unused dead code** (no processor consumes
  them) — safe to delete both entries regardless of whether you keep Media.

### Database

Drop table: `media` (`0009_create_media.sql`). Remove from `schema.ts`: `media`,
`mediaRelations`.

### Env vars

Remove: `AWS_S3_BUCKET`, `AWS_S3_REGION`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `STORAGE_PROVIDER`.

### Packages to remove

`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `cloudinary`, `multer`, `@types/multer` —
verify `multer` isn't reused for a non-media upload elsewhere first (only
`file-upload.interceptor.ts` uses it today).

### Cross-module coupling

None — no other module references `FileUploadInterceptor` or media entities (e.g. no
user-avatar-upload coupling).

</details>

---

## 6. Webhooks

<details>
<summary><strong>6. Webhooks</strong> — removes outbound HMAC-signed webhook delivery</summary>

### Delete these files

```
src/webhooks/                          # entire directory: webhooks.module.ts,
                                        # webhooks.controller.ts (+spec), webhooks.service.ts
                                        # (+spec), dto/**, interfaces/webhook.interface.ts
src/background/queue/webhook/          # entire directory: webhook-queue.module.ts,
                                        # webhook-queue.service.ts (+spec), webhook.processor.ts
                                        # (+spec), webhook.queue.ts, webhook-queue.events.ts,
                                        # webhook-queue-ui.module.ts
src/db/repositories/webhooks/webhooks.repository.ts (+ .spec.ts)
```

### Edit these files

- **`src/app.module.ts`** — remove `import { WebhooksModule } from './webhooks/webhooks.module'`
  and `WebhooksModule` from `imports` (the `// Webhooks` block).
- **`src/main.ts`** — remove the same import and drop from `V1_MODULES`.
- **`src/common/route-names.ts`** — remove `WEBHOOKS = 'webhooks'`.
- **`src/background/background.module.ts`** — remove `WebhookQueueModule` import and from
  `imports`.
- **`src/background/queue-ui.module.ts`** — remove `WebhookQueueUIModule` import and from
  `imports`.
- **`src/background/constants/job.constant.ts`** — remove `WEBHOOK` from `QueueName` and
  `WEBHOOK_DELIVER` from `JobName`.
- **`src/db/db.module.ts`** — remove the `WebhooksRepository` import and its entry.

### Database

Drop tables: `webhooks`, `webhook_deliveries` (`0013_create_webhooks.sql`). Remove from
`schema.ts`: `webhooks`, `webhooksRelations`, `webhookDeliveries`, `webhookDeliveriesRelations`.

### Env vars

None — the HMAC signing secret is generated per-webhook and stored in the `webhooks.secret`
column, not a global env var.

### Cross-module coupling

> [!WARNING]
> `src/background/queue/webhook/webhook-queue.service.ts` imports `WebhooksRepository` **directly**
> (bypassing `WebhooksModule`) — you must delete both the business module and the queue module
> together, or the queue service will fail to resolve its dependency. The webhook queue shares the
> `DeadLetterQueueModule` with the email/notification queues — do **not** delete
> `dead-letter-queue`, only remove the webhook-specific registration from it if any exists.

</details>

---

## 7. Audit logging

<details>
<summary><strong>7. Audit logging</strong> — removes unwired application-level audit logging</summary>

> [!IMPORTANT]
> `@AuditLog()` and `AuditInterceptor` are **not currently applied to any controller** anywhere in
> this boilerplate, and `AuditInterceptor` is not registered as a global `APP_INTERCEPTOR`. This
> means removal has essentially zero call-site cleanup — it's unwired infrastructure today. Don't
> waste time searching for `@AuditLog()` usages; there are none.

### Delete these files

```
src/common/audit/            # entire directory: audit.module.ts, audit.service.ts (+spec),
                              # audit.decorator.ts, audit.interceptor.ts (+spec),
                              # interfaces/audit-log-options.interface.ts
src/db/repositories/common/audit.repository.ts (+ .spec.ts)
```

### Edit these files

- **`src/app.module.ts`** — remove `import { AuditModule } from '@common/audit/audit.module'` and
  `AuditModule` from `imports` (the `// Common` block).
- **`src/db/db.module.ts`** — remove the `AuditRepository` import and its entry.

### Database

Drop table: `audit_logs` (app-level audit, written by `AuditService.log()`, created in
`0000_init.sql`). Remove `auditLogs` from `schema.ts`.

> [!IMPORTANT]
> Do not confuse with `db_audit_logs`. That's a *separate*, DB-trigger-based audit
> mechanism (unrelated to `@AuditLog()`/`AuditService`), created in `0000_init.sql` with a trigger
> function `log_db_changes()` (`0001_triggers_and_functions.sql`) attached to the `users` table via
> `users_audit_trigger` (`0002_create_users.sql`). If you want to remove *all* audit logging
> (app-level **and** DB-level), you must additionally drop: the `users_audit_trigger` trigger, the
> `log_db_changes()` and `prevent_audit_log_deletion()` functions/triggers, and the `db_audit_logs`
> table — all in raw SQL, not in `schema.ts`.

### Env vars

None.

### Cross-module coupling

None.

</details>

---

## 8. Notifications (push / in-app)

<details>
<summary><strong>8. Notifications (push / in-app)</strong> — removes FCM push and in-app notifications</summary>

### Delete these files

```
src/notifications/                       # entire directory: notifications.module.ts,
                                          # notifications.controller.ts (+spec),
                                          # notifications.service.ts (+spec), dto/**,
                                          # interfaces/notification.interface.ts,
                                          # providers/push.provider.ts,
                                          # providers/fcm.provider.ts (+spec)
src/background/queue/notification/       # entire directory: notification-queue.module.ts,
                                          # notification-queue.service.ts (+spec),
                                          # notification.processor.ts (+spec),
                                          # notification.queue.ts, notification-queue.events.ts,
                                          # notification-queue-ui.module.ts
src/db/repositories/notifications/notifications.repository.ts (+ .spec.ts)
```

### Edit these files

- **`src/app.module.ts`** — remove `import { NotificationsModule } from
  './notifications/notifications.module'` and from `imports` (the `// Notifications` block).
- **`src/main.ts`** — remove the same import and drop from `V1_MODULES`.
- **`src/common/route-names.ts`** — remove `NOTIFICATIONS = 'notifications'`.
- **`src/background/background.module.ts`** — remove `NotificationQueueModule` import and from
  `imports`.
- **`src/background/queue-ui.module.ts`** — remove `NotificationQueueUIModule` import and from
  `imports`.
- **`src/background/constants/job.constant.ts`** — remove `NOTIFICATION` from `QueueName`; remove
  `NOTIFICATION_TO_DEVICE`, `NOTIFICATION_TO_TOPIC`, `NOTIFICATION_SEND` from `JobName`.
- **`src/db/db.module.ts`** — remove the `NotificationsRepository` import and its entry.

### Database

Drop tables: `notifications`, `device_tokens` (`0010_create_notifications.sql`). Remove from
`schema.ts`: `notifications`, `notificationsRelations`, `deviceTokens`, `deviceTokensRelations`.
(Note: the `device_tokens.fid` column stores a Firebase Installation ID, not an FCM token — see
`CHANGELOG.md` v2.0.0 for why.)

### Env vars

Remove: `FCM_PROJECT_ID`, `FCM_PRIVATE_KEY`, `FCM_CLIENT_EMAIL`.

### Packages to remove

`firebase-admin`.

### Cross-module coupling

> [!WARNING]
> `src/background/queue/notification/notification-queue.module.ts` imports `NotificationsModule`
> **directly** — delete both together, this is real coupling (unlike webhooks, which bypasses its
> business module and only pulls the repository). `notifications.controller.ts` also uses
> `@Roles('admin')` — see §1 if RBAC is also being removed.

</details>

---

## 9. Gateway (WebSocket / Socket.IO)

<details>
<summary><strong>9. Gateway (WebSocket / Socket.IO)</strong> — removes the Socket.IO real-time gateway</summary>

### Delete these files

```
src/gateway/          # entire directory: events.gateway.ts, gateway.module.ts
```

### Edit these files

- **`src/app.module.ts`** — remove `import { GatewayModule } from './gateway/gateway.module'` and
  `GatewayModule` from `imports` (the `// Real-time` block). Gateways aren't REST controllers, so
  there's nothing to remove from `main.ts`'s Swagger `V1_MODULES`.

### Database

None.

### Env vars

None dedicated.

### Packages to remove

`socket.io`, `@nestjs/platform-socket.io`.

### Cross-module coupling

None — confirmed no other module injects `EventsGateway`.

</details>

---

## 10. Data export (CSV/PDF/Excel)

<details>
<summary><strong>10. Data export (CSV/PDF/Excel)</strong> — removes the unregistered CSV/PDF/Excel export service</summary>

> [!IMPORTANT]
> `ExportModule` is **not imported anywhere** in this boilerplate — not in
> `app.module.ts`, not in any business module. It's dead/unregistered code today. Deleting it
> requires zero registration cleanup.

### Delete these files

```
src/common/export/     # entire directory: export.module.ts, export.service.ts (+spec),
                        # interfaces/export.interface.ts, providers/** (+specs)
```

### Edit these files

None — nothing references this module.

### Database

None.

### Env vars

None.

### Packages to remove

`exceljs`, `pdfkit`, `@types/pdfkit`.

### Cross-module coupling

None.

</details>

---

## 11. AWS-Emulated Local Stack (Floci)

<details>
<summary><strong>11. AWS-Emulated Local Stack (Floci)</strong> — removes the second, `DEPLOYMENT_TARGET=aws` dev stack, keeping only the default self-hosted one</summary>

> [!IMPORTANT]
> This is purely additive infrastructure — the default `local` mode (`docker-compose.yml`,
> BullMQ + Redis, `.env`-based config) is completely unaffected by removing this. Every `isAws`
> branch below simply falls back to the `local`-mode behavior that already existed before Floci
> was added.

### Delete these files

```
docker-compose.floci.yml
infra/floci/                              # entire Terraform directory
src/config/secrets-bootstrap.ts
src/common/helpers/aws-endpoint.util.ts   # (+ spec, if any)
src/background/providers/sqs-queue.publisher.ts
src/background/providers/sqs-queue-consumer.base.ts
src/background/queue/email/email-sqs.consumer.ts
src/background/queue/notification/notification-sqs.consumer.ts
src/background/queue/webhook/webhook-sqs.consumer.ts
src/background/cron/cron-sqs.consumer.ts
src/background/queue/dead-letter/dead-letter-sqs.consumer.ts
src/api/dev-tools/services/sqs-queue-status.service.ts (+spec)
src/api/dev-tools/dto/queue-depth.dto.ts
views/dev-tools-queues.pug
```

### Edit these files

- **`src/main.ts` / `src/worker.main.ts`** — remove the `hydrateSecretsIfNeeded()` dynamic-import
  gate; go back to a plain top-level `import { AppModule } from './app.module'` /
  `import { WorkerModule } from './worker.module'` (the logic in `src/bootstrap.ts`/
  `src/worker-bootstrap.ts` doesn't need to change — only how it's invoked).
- **`src/background/providers/queue-transport.module.ts`** and every `*-queue-ui.module.ts` /
  `*-queue.module.ts` / `cron-ui.module.ts` / `cron.module.ts` / `dead-letter-queue.module.ts` /
  `deadletter-queue-ui.module.ts` — remove the `isAws` conditional, keeping only the `local`/BullMQ
  branch (`BullMqQueuePublisher`, `EmailProcessor`, `NotificationProcessor`, `WebhookProcessor`,
  `CronProcessor`, `DeadLetterProcessor`).
- **`src/media/providers/s3.provider.ts`, `src/email/providers/ses.provider.ts`,
  `src/sms/providers/sns.provider.ts`** — remove the `getAwsEndpointOverride()` call and the
  conditional `endpoint`/`forcePathStyle` client option.
- **`src/api/dev-tools/dev-tools.controller.ts`** — remove the `isAws` branch in `showTools()`
  (always show the "Bull Board" card) and delete the `showQueues()` method + its
  `SqsQueueStatusService` injection.
- **`src/api/dev-tools/dev-tools.module.ts`** — remove `SqsQueueStatusService` from `providers`.
- **`package.json`** — remove `db:aws:up`, `db:aws:rm`, `infra:floci:up`, `infra:floci:down`,
  `local:aws:up`, `api:aws:start:dev`, `worker:aws:start:dev` scripts.

### Database

None.

### Env vars

Remove: `DEPLOYMENT_TARGET`, `FLOCI_ENDPOINT`, `FLOCI_PORT`, `SECRETS_MANAGER_SECRET_ID`,
`EMAIL_QUEUE_URL`, `NOTIFICATION_QUEUE_URL`, `WEBHOOK_QUEUE_URL`, `DEAD_LETTER_QUEUE_URL`,
`CRON_QUEUE_URL` (from `EnvConfig`/`.env.example`).

### Packages to remove

`@aws-sdk/client-sqs`, `@aws-sdk/client-secrets-manager` — verify first that nothing else needs
them (this boilerplate doesn't use either package anywhere else).

### Cross-module coupling

None beyond the `isAws` conditionals listed above — every business-logic class
(`*-queue.service.ts`) stays transport-agnostic and needs zero changes.

</details>
