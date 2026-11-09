---
sidebar_position: 6
---

# Configuration Reference

Every environment variable the backend and web app read, grouped by what it configures. This is the
single place the rules are written down: other pages link here instead of repeating them.

How to read the tables:

- **Required** says when start-up fails without it. "Production" means `NODE_ENV=production`.
- **Secret** marks values that must come from a secrets store and never from the repository.
- Where a value is shared by the API and the worker, both processes need it.
- The contract is enforced by `apps/backend/src/config/env-config.schema.ts` and
  `env-config.module.ts`. The shipped example is `apps/backend/.env.example`.

## Backend

### Core

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `NODE_ENV` | Always (`development` or `production`) | none | No | There is deliberately no default. `production` turns on real email delivery, secure cookies and the production checks below. Anything else, including a staging box, behaves as development |
| `PORT` | Always | none | No | The API's listening port (3000 in the example file) |
| `CORS_ORIGINS` | Always | none | No | Comma-separated list of origins allowed to make credentialed requests, normally the web app's origin |
| `TRUST_PROXY_HOPS` | Production | 0 | No | How many reverse proxies sit in front of the API. It decides which address the rate limiter sees. Too low and every client shares one bucket, too high and a client can fake its address. Use 0 only when the API is directly exposed |
| `FRONTEND_URL` | No | empty | No | The web app's public URL. The backend uses it to build the links in invitations, erasure notices and plan emails, the return addresses for Stripe and for the Google connection, and to decide how to behave. Outside production, an empty or loopback value marks the environment as local development (Swagger, a writable queue dashboard, invitation links written to the log). An `https` value turns on secure cookies. Set it on every deployed environment |
| `DEPLOYMENT_TARGET` | No | `local` | No | `local` or `aws`. `aws` uses SQS for queues and loads settings from Secrets Manager. See [Environments](../infrastructure/environments.md) |
| `DEFAULT_PAGE`, `DEFAULT_PAGE_SIZE` | No | 1, 10 | No | Pagination defaults |
| `ERASURE_GRACE_PERIOD_DAYS` | No | 21 | No | How long a deletion request can be undone before the nightly purge erases the business. Shown to users as a deploy-level value on the platform configuration |

### Database

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `DATABASE_URL` | Always (must start `postgresql://`) | none | Yes | The connection string used by the API, worker and migrations |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` | Always | none | No | The same connection, as parts |
| `POSTGRES_PASSWORD` | Always | none | Yes | |
| `DB_POOL_MAX` | No (1 to 200) | 10 | No | Connections per process. Total database connections are about (API replicas + worker replicas) x this value |
| `DB_IDLE_TIMEOUT_MS` | No | 30000 | No | Closes a connection idle this long |
| `DB_CONNECTION_TIMEOUT_MS` | No | 5000 | No | How long to wait for a free connection |
| `DB_STATEMENT_TIMEOUT_MS` | No | 30000 | No | Cancels a query that runs longer |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED` | No (`true` or `false`) | off | No | Turns on TLS to the database, and whether to verify its certificate |

### Redis

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `REDIS_HOST`, `REDIS_PORT` | Always | none | No | |
| `REDIS_PASSWORD` | Always | none | Yes | |
| `REDIS_TLS_ENABLED` | No | `false` | No | TLS to Redis |

### Sessions and sign-in

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `JWT_SECRET` | Always | none | Yes | Signs access tokens. At least 32 characters. Changing it signs every user out |
| `JWT_REFRESH_SECRET` | Production, and it must differ from `JWT_SECRET` | none (development falls back to `JWT_SECRET`) | Yes | Signs refresh tokens. Identical secrets would let a leaked access token pose as a refresh token |
| `VERIFY_EMAIL_OTP_TTL_MINUTES` | No | 10 | No | How long an emailed verification code is valid |
| `DEV_VERIFY_EMAIL_TOKEN` | **Forbidden** in production | none | Yes | A fixed code that verifies any address, for local development. Allowed only when `FRONTEND_URL` is a localhost address |
| `GOOGLE_AUTH_STATE_SECRET` | Production | none | Yes | Signs the Google sign-in round trip. At least 32 characters |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | No | none | Secret: the second | Google sign-in. Without them the button is hidden or the sign-in answers `NOT_CONFIGURED` |
| `GOOGLE_CALLBACK_URL` | No | none | No | Where Google returns after sign-in |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL` | No | none | Secret: the second | Microsoft sign-in |
| `MICROSOFT_AUTHORITY` | No | Microsoft's `common` endpoint | No | In production it must be `https://login.microsoftonline.com/<tenant>`, because the signing keys and issuer are derived from it |
| `ADMIN_MICROSOFT_TENANT_ID` | No | none | No | A GUID. Pins platform-admin Microsoft sign-in to one directory. Without it the admin Microsoft button is hidden |
| `ROOT_ADMIN_EMAIL`, `ROOT_ADMIN_PASSWORD` | Only for the seed job | none | Password: yes | Read by `pnpm db:seed:admin:prod`, which refuses the shipped placeholder password |

### Google Business Profile

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET` | No | none | Secret: the second | The Google Cloud OAuth client used to read reviews. Without them connection routes answer 503 |
| `GBP_CALLBACK_URL` | No | none | No | Points at the web app's origin |
| `GBP_STATE_SECRET` | Production | none | Yes | Signs the connect round trip. At least 32 characters |
| `CREDENTIAL_ENCRYPTION_KEY` | Outside production and `aws`, when the Redis credential store is used | none | Yes | Base64, 32 bytes. Encrypts Google refresh tokens held in Redis. In production the tokens live in Secrets Manager instead |

### Billing

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `PAYMENT_FEATURE_ENABLED` | No (`true` or `false`) | off | No | The master switch. Off blocks checkout **and lifts every plan limit**. Shown to the web app as `paymentFeatureEnabled` |
| `STRIPE_SECRET_KEY` | Only when payments are on (any environment) | none | Yes | Not needed while `PAYMENT_FEATURE_ENABLED` is off, production included |
| `STRIPE_WEBHOOK_SECRET` | Only when payments are on (any environment) | none | Yes | Verifies the signature on every Stripe delivery |
| `STRIPE_PRICE_ID_PAID` | No | none | No | The Stripe price that the Paid plan sells |

### AI

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `AI_PROVIDER` | No | `azure` | No | `azure` or `openrouter` |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | When `azure` | none | No | |
| `AZURE_OPENAI_API_KEY` | When `azure` | none | Yes | |
| `AZURE_OPENAI_REGION` | When `azure` (`westeurope` or `northeurope`) | none | No | Keeps generation inside the EU. Any other value is rejected |
| `OPENROUTER_API_KEY` | When `openrouter` | none | Yes | |
| `OPENROUTER_MODEL` | When `openrouter` | none | No | |

### Email

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `EMAIL_DELIVERY_ENABLED` | No (`true` or `false`) | off | No | Master switch for email/password. Off, the server reports `emailDeliveryAvailable: false`, password sign-in is not in effect and an admin cannot turn it on, even when the provider credentials are present. Set it to `true` only when this deployment actually delivers email |
| `EMAIL_PROVIDER` | No | `smtp` | No | `smtp` or `ses`. Only consulted in production |
| `EMAIL_FROM` | No. Set it when email is used | `noreply@example.com` | No | The sender. If it is left unset in production, mail goes out from `example.com` |
| `SMTP_HOST`, `SMTP_PORT` | When `smtp` | `localhost`, 587 | No | Port 465 uses implicit TLS |
| `SMTP_USER` | When `smtp` | empty | No | |
| `SMTP_PASSWORD` | When `smtp` | empty | Yes | |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | When `ses` or `aws` | region `us-east-1` | Keys: yes | Used for SES, SQS and Secrets Manager |

### Media

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | No | none | No | |
| `CLOUDINARY_API_KEY` | No | none | No | |
| `CLOUDINARY_API_SECRET` | No | none | Yes | Without these three, avatar upload answers 503. They are not enforced at start-up |

### Queues and secrets (when `DEPLOYMENT_TARGET=aws`)

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `EMAIL_QUEUE_URL`, `CRON_QUEUE_URL`, `DEAD_LETTER_QUEUE_URL`, `REVIEW_POST_QUEUE_URL` | In `aws` mode | none | No | The queue URLs. The name is derived from the queue: for example `review-post` becomes `REVIEW_POST_QUEUE_URL`. `review-sync` has none: it always uses BullMQ |
| `SECRETS_MANAGER_SECRET_ID` | No | `nestjs-app/<NODE_ENV>` | No | The secret whose JSON keys are loaded into the environment at start-up |
| `FLOCI_ENDPOINT` | No | none | No | Points the AWS clients at the local emulator. Local use only |

### Operations

| Variable | Required | Default | Secret | Effect |
|---|---|---|---|---|
| `METRICS_TOKEN` | Production (at least 24 characters) | none | Yes | The bearer token `/metrics` demands. Outside production an unset token leaves it open on a developer machine and refuses requests elsewhere |
| `TZ` | No, **set `UTC` on the worker** | the host's time zone | No | The API pins UTC in code. The worker does not, and it fires the scheduled jobs |

### Boot checks

The process refuses to start in production when:

- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_AUTH_STATE_SECRET`, `GBP_STATE_SECRET` or
  `CREDENTIAL_ENCRYPTION_KEY` contains the text `change-in-production` (the shipped placeholder, also
  detected inside the base64 key). Other environments only warn.
- `JWT_REFRESH_SECRET` is missing or equals `JWT_SECRET`.
- `GBP_STATE_SECRET` or `GOOGLE_AUTH_STATE_SECRET` is missing.
- `TRUST_PROXY_HOPS` or `METRICS_TOKEN` is missing.
- `PAYMENT_FEATURE_ENABLED` is on and `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` is missing. This applies in
  every environment, not only production.
- `DEV_VERIFY_EMAIL_TOKEN` is set.

## Web app

Defined in `apps/web/env.ts`. Anything prefixed `NEXT_PUBLIC_` is compiled into the browser bundle and
visible to every visitor, so it must never hold a secret.

| Variable | Where | Default | Secret | Effect |
|---|---|---|---|---|
| `API_URL` | Server, **read at build time** | `http://localhost:3000` | No | The API the `/v1/*` rewrite forwards to. It is written into the build output, so changing it needs a rebuild |
| `NODE_ENV` | Server | `development` | No | |
| `NEXT_PUBLIC_APP_ENV` | Browser | `development` | No | `development`, `staging` or `production` |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TITLE`, `NEXT_PUBLIC_APP_DESCRIPTION`, `NEXT_PUBLIC_APP_CATEGORY`, `NEXT_PUBLIC_APP_KEYWORDS` | Browser | `InnoPeak` and similar | No | Page title and metadata |
| `NEXT_PUBLIC_APP_URL` | Browser | `http://localhost:3000` | No | The app's public URL, used in metadata |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser | none | No (publishable) | The card form. Without it the form shows an error |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser | none | No | Turns on error reporting |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Server, build time | none | Token: yes | Uploads source maps during the build. All three are needed |
| `SENTRY_TRACES_SAMPLE_RATE` | Server | 0 | No | Performance sampling |
| `ANALYZE` | Build | `false` | No | Produces a bundle report |

## Variables you may see that nothing reads

`apps/backend/.env.example` and `env.config.ts` carry some names for tools that are not part of the
running application:

| Names | Status |
|---|---|
| `PROMETHEUS_*`, `GRAFANA_*`, `LOKI_*`, `PROMTAIL_PORT`, `NODE_EXPORTER_*`, `SERVICES_HEALTH_URL`, `NESTJS_METRICS_TARGET` | Read only by `docker-compose` and the monitoring configuration |
| `OTEL_*`, `JAEGER_*`, `JAGER_URL` | Nothing in the code reads them: there is no tracing |
| `REVIEW_SYNC_QUEUE_URL` | Unused: `review-sync` always runs on BullMQ |
| `GITHUB_*`, `TWILIO_*`, `SMS_PROVIDER`, `AWS_SNS_SENDER_ID`, `FCM_*`, `AWS_S3_BUCKET`, `AWS_S3_REGION`, `NOTIFICATION_QUEUE_URL`, `WEBHOOK_QUEUE_URL` | Left over from the starter template and unused |
