---
sidebar_position: 5
---

# External Services

InnoPeak depends on a handful of outside services. This page says what each one is used for, which
settings connect it, and what happens when it is missing or unreachable. Variable names link to the
[Configuration reference](./configuration-reference.md), which is the one place their exact rules are
written down.

Most integrations are checked when first used rather than at start-up. An install without Stripe keys,
for example, still boots and answers `503` only on the routes that need Stripe. The exceptions are
noted below.

## Summary

| Service | Used for | Required to boot |
|---|---|---|
| PostgreSQL | All business data | Yes |
| Redis | Queues, rate limits, instant sign-out, live notifications | Yes |
| Google Business Profile API | Reading reviews and posting replies | No, but nothing syncs without it |
| Google and Microsoft sign-in | Single sign-on for businesses and admins | No |
| Stripe | Paid plans, receipts | **Not needed in phase 1.** Required only once payments are switched on. See [Stripe](#stripe) |
| Cloudinary | Profile pictures | No |
| AI provider (Azure OpenAI or OpenRouter) | Drafting replies | No |
| Email (SMTP or SES) | Invitations, deletion codes, notices, sign-up codes | **Not needed to start.** See [Email](#email) for what waits on it |
| AWS SQS and Secrets Manager | Queues and secrets when `DEPLOYMENT_TARGET=aws` | Only in that mode |
| Sentry | Error reporting in the web app | No |

The owner of each vendor account is not recorded in the repository. Fill in the account owner and the
support contact for each in [Open items](../infrastructure/open-items.md).

## PostgreSQL

The system of record. Connection settings: `DATABASE_URL` plus `POSTGRES_*`, with optional pool and
SSL tuning (`DB_POOL_MAX`, `DB_SSL` and others). Sizing is covered in
[Data stores](../infrastructure/data-stores.md).

- **If missing:** the API and worker refuse to start.
- **If it goes down:** requests answer 503 and the readiness probe fails.

## Redis

Holds the job queues, the rate-limit counters, the "not before" marks that make sign-out and password
changes take effect at once, the live notification channel, and (outside production) the encrypted
Google credentials. Settings: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS_ENABLED`.

- **If missing:** the API and worker refuse to start.
- **If it goes down:** rate limiting and instant sign-out stop being enforced (both give up after 500
  ms and let the request through). Adding a job gives up after 5 seconds with a 503. Jobs already
  queued wait.

## Google Business Profile API

Used to list a business's locations, read reviews and post replies. Settings: `GBP_CLIENT_ID`,
`GBP_CLIENT_SECRET`, `GBP_CALLBACK_URL` (which points at the web app's address), `GBP_STATE_SECRET`
(required in production) and `CREDENTIAL_ENCRYPTION_KEY`. Setting up the Google Cloud project is
described in [Google API setup](../backend/connections/google-api-setup.md).

- **If not configured:** the connection routes answer 503 `PROVIDER_NOT_CONFIGURED`. Outside
  production without `CREDENTIAL_ENCRYPTION_KEY`, the credential store cannot be built and the
  process fails to start.
- **Where tokens are kept:** the Google refresh tokens are stored in AWS Secrets Manager in
  production and when `DEPLOYMENT_TARGET=aws`, and otherwise in Redis, encrypted with
  `CREDENTIAL_ENCRYPTION_KEY`.
- **If the owner revokes access:** the connection moves to `needs_reauth` and polling stops for its
  locations until the owner reconnects.
- **If Google is down or rate-limiting:** that poll fails or waits, and the next 15-minute cycle
  tries again. Nothing is lost, because the import is idempotent.

## Google and Microsoft sign-in

Single sign-on for businesses and for platform admins. Settings: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `GOOGLE_AUTH_STATE_SECRET` (required in production),
`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_CALLBACK_URL`, `MICROSOFT_AUTHORITY` and
`ADMIN_MICROSOFT_TENANT_ID`.

- **If not configured:** the sign-in redirects back to the sign-in page with `?error=NOT_CONFIGURED`.
  The admin sign-in page hides a button whose provider is not configured: Google follows
  `adminGoogleLoginAvailable`, Microsoft follows `adminMicrosoftLoginAvailable`.
- **Microsoft for admins** is pinned to one Entra directory, `ADMIN_MICROSOFT_TENANT_ID`, and is
  sign-in only. See [Microsoft sign-in](../backend/auth/microsoft-login-design.md).
- **Switching a method off** in the admin console only affects business sign-in. See
  [Platform settings](./platform-settings.md).

## Stripe

**Not needed in phase 1.** Payments stay switched off, so no Stripe account, price, webhook or key is
needed yet, in production too, and plan limits are not applied. The two keys become required, in every
environment, the moment `PAYMENT_FEATURE_ENABLED` is switched on.

Takes payment for the Paid plan. Settings: `PAYMENT_FEATURE_ENABLED` (the master switch),
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PAID`, and in the web app
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Stripe also calls the API's webhook
(`POST /v1/billing/webhooks/stripe`), which must be reachable from the internet and registered in
the Stripe dashboard. Every delivery is signature-checked.

- **If keys are missing:** checkout and billing routes answer 503 `PAYMENT_NOT_CONFIGURED`.
  Production and any environment with `PAYMENT_FEATURE_ENABLED=true` refuse to start without the
  secret key and webhook secret.
- **If payments are switched off:** checkout is blocked **and every plan limit is lifted**, so a
  Free business behaves like a Paid one. Treat `PAYMENT_FEATURE_ENABLED` as a plan-enforcement
  switch, not only a billing one.
- **If Stripe has a transient failure:** the routes answer 503 and can be retried.

See [Billing](../backend/billing/overview.md).

## Cloudinary

Stores profile pictures. The browser uploads directly to Cloudinary with a server-signed request, and
the server then checks the upload before recording it. Settings: `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

- **If not configured:** the application starts normally and avatar upload answers 503
  `STORAGE_NOT_CONFIGURED`. Nothing else is affected. These three are not enforced at start-up, even
  in production.

## AI provider

Writes the reply drafts. `AI_PROVIDER` chooses between:

| Value | Settings | Notes |
|---|---|---|
| `azure` (default) | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_REGION` | The region must be `westeurope` or `northeurope`, so reply generation stays inside the EU. A region is only added with the client's agreement |
| `openrouter` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | A working secondary option. There is no default model |

Each call has a 30-second limit and is not retried, and a draft is capped at 400 output tokens.

- **If not configured:** it is detected on the first call, not at start-up. User-triggered
  generation answers 503 `AI_PROVIDER_NOT_CONFIGURED`. The worker logs it and abandons the remaining
  candidates in that batch. A business with no prompt gets 404 `AI_PROMPT_NOT_CONFIGURED`.

See [AI](../backend/ai/overview.md).

## Email

Sends sign-up codes, invitations, the code that confirms deleting a business, erasure notices and
plan-limit warnings.

**Not needed to start.** With email/password sign-in off, business users sign in with Google or
Microsoft, and nothing in that path sends mail. Until an email service is set up, these cannot be
delivered:

- invitations to teammates and to platform admins, and the code an admin needs to add a password to a
  Google or Microsoft account;
- the code that confirms an owner deleting their own business (a platform admin can still request
  erasure from the admin console);
- the notices and reminders about a scheduled deletion, the alert to admins when the nightly purge
  skips a business, and the warning that plan limits paused locations;
- sign-up codes, which only matter while email/password sign-up is on.

A production process with no email service configured still starts, but its email jobs fail and are
retried (the SMTP sender falls back to `localhost`). See [Open items](../infrastructure/open-items.md).

- **Outside production nothing is ever sent.** A no-op sender writes the message to the log,
  whatever `EMAIL_PROVIDER` says. Real delivery starts only when the process runs with
  `NODE_ENV=production`. A staging box that runs as `development` will not email anyone.
- **In production,** `EMAIL_PROVIDER` is `smtp` (the default: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
  `SMTP_PASSWORD`) or `ses` (`AWS_REGION` and AWS credentials). `EMAIL_FROM` is the sender.
- **What counts as "set up".** Email/password sign-in can only be switched on in the admin console
  when `EMAIL_DELIVERY_ENABLED=true` **and** the provider really sends: production, `EMAIL_FROM` set
  (it defaults to `noreply@example.com`), and for SMTP `SMTP_HOST` set (it defaults to `localhost`).
  The env flag is off by default, so a deployment that has not been wired up for email stays
  password-free without relying on a stored switch. See
  [Platform settings](./platform-settings.md).
- **If SMTP is unreachable at start-up:** the failure is logged ("Emails may not be sent") and the
  process still starts.

## AWS SQS and Secrets Manager

Used only when `DEPLOYMENT_TARGET=aws`. Queues for `email`, `cron`, `dead-letter` and `review-post` go
through SQS (`EMAIL_QUEUE_URL`, `CRON_QUEUE_URL`, `DEAD_LETTER_QUEUE_URL`, `REVIEW_POST_QUEUE_URL`),
and the process loads its settings from one Secrets Manager secret (`SECRETS_MANAGER_SECRET_ID`,
default `nestjs-app/<NODE_ENV>`) before it starts. `review-sync` stays on BullMQ and Redis in every
environment. In any other mode BullMQ carries every queue. See [Environments](../infrastructure/environments.md).

## Sentry

Error reporting for the web app only, enabled by `NEXT_PUBLIC_SENTRY_DSN`. Without a DSN nothing is
reported. The backend has no error-reporting service: its failures go to the console log.
