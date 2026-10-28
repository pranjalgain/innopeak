---
sidebar_position: 6
---

# Secrets and Access

Which values are secret, where each environment should keep them, what happens when one is rotated,
and which permissions the application needs in the cloud. Variable meanings are in the
[Configuration reference](../services/configuration-reference.md).

## Where secrets live

| Environment | Where secrets come from | Status |
|---|---|---|
| Local | A `.env` file on the developer's machine, copied from `.env.example` | Works. Never commit the real file |
| AWS-emulated | One Secrets Manager secret, `nestjs-app/<environment>`, loaded into the environment at start-up | Works against the emulator |
| Production on AWS | The same mechanism with `DEPLOYMENT_TARGET=aws`: one Secrets Manager secret (`SECRETS_MANAGER_SECRET_ID`) whose JSON keys become environment variables | Mechanism exists, never run against real AWS |
| Production on Kubernetes | Not defined. The k3s template reads its settings from a **ConfigMap**, which is not suitable for secrets | **Gap.** Use Kubernetes Secrets, or an external secrets operator |

Production refuses to start on a shipped placeholder secret, on equal access and refresh secrets,
and when required secrets are missing. The exact rules are under
[Boot checks](../services/configuration-reference.md#boot-checks). Generate real values with, for
example, `openssl rand -base64 48`.

## Inventory

| Secret | Used for | Effect of rotating it |
|---|---|---|
| `JWT_SECRET` | Signing access tokens, and the queue dashboard's admin check | Every access token stops working. Business users are re-issued a token from their refresh token on the next request. **Platform admins must sign in again.** Roll all replicas together: there is no support for two keys at once |
| `JWT_REFRESH_SECRET` | Signing refresh tokens | **Every business user is signed out** |
| `DATABASE_URL`, `POSTGRES_PASSWORD` | Database access | Change it in the database and the secret, then restart every process |
| `REDIS_PASSWORD` | Redis access | Same. Restart the API and worker together |
| `GOOGLE_AUTH_STATE_SECRET`, `GBP_STATE_SECRET` | Signing the sign-in and connect round trips | Flows in flight fail and are repeated. `GBP_STATE_SECRET` also protects pending account choices, which are short-lived |
| `CREDENTIAL_ENCRYPTION_KEY` | Encrypting Google refresh tokens held in Redis (outside production) | **Stored tokens become unreadable and every owner must reconnect Google.** Not used in production |
| `GBP_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET` | OAuth clients | Rotate in the provider's console and the secret together. Existing Google tokens stay valid for the same client |
| `STRIPE_SECRET_KEY` | Calling Stripe | Roll in the Stripe dashboard, then update the secret |
| `STRIPE_WEBHOOK_SECRET` | Verifying webhook signatures | Roll in Stripe and update the secret at the same time. Deliveries signed with the old secret are rejected and retried by Stripe |
| `AZURE_OPENAI_API_KEY` or `OPENROUTER_API_KEY` | Drafting replies | Drafting fails until the new key is in place |
| `SMTP_PASSWORD`, or AWS access keys | Sending email | Emails fail and retry until the new value is in place |
| `CLOUDINARY_API_SECRET` | Signing avatar uploads | Avatar upload fails until updated |
| `METRICS_TOKEN` | Protecting `/metrics` | Update the Prometheus scrape configuration at the same time |
| `ROOT_ADMIN_PASSWORD` | Creating the first platform admin | Only read by the seed job, and only to create the account. Change an existing admin's password in the admin console |
| `SENTRY_AUTH_TOKEN` | Uploading source maps during the web build | Only the build is affected |

There is no automated rotation. Record an owner and a schedule for each in [Open items](./open-items.md).

Values with the prefix `NEXT_PUBLIC_` are compiled into the browser bundle. They must never hold a
secret. The Stripe publishable key and the Sentry DSN are meant to be public.

## Cloud permissions

For an AWS deployment the workload's role needs these. The Terraform in `apps/backend/infra/floci`
grants only part of them, and the emulator does not enforce IAM, so the gaps have never surfaced.

| Needed for | Actions | Granted by the Terraform |
|---|---|---|
| Loading settings at start-up | `secretsmanager:GetSecretValue` on the app secret | Yes |
| Queues | `sqs:SendMessage`, `ReceiveMessage`, `DeleteMessage`, `GetQueueAttributes`, `GetQueueUrl` on each queue and its `-dlq` | Yes |
| **Keeping a long job's message hidden** | `sqs:ChangeMessageVisibility` | **No.** Without it a job longer than 60 seconds is offered to another consumer and runs twice |
| **Google refresh tokens in production** | `secretsmanager:CreateSecret`, `PutSecretValue`, `GetSecretValue`, `DeleteSecret` on `innopeak/<environment>/review-credentials*` | **No.** Without it connecting Google fails in production |
| Sending mail through SES, only if SES is chosen later | `ses:SendRawEmail` | **No**, and SES is not provisioned |
| Media bucket | `s3:*` on the media bucket | Granted, but nothing in the application uses S3 |

The secret names also differ: the app settings use the prefix `nestjs-app/` and the Google token store
uses `innopeak/`. Pick one naming scheme before production.

## Network exposure

| Endpoint | Who should reach it | Protection in the application |
|---|---|---|
| `/v1/*`, health | The web app, and the public for the webhook and OAuth callbacks | Rate limits, authentication, roles |
| `POST /v1/billing/webhooks/stripe` | Stripe's addresses | Signature check on the raw body. Must be reachable from the internet |
| `/metrics` | The monitoring system only | Bearer `METRICS_TOKEN`. Also restrict at the network edge |
| `/admin/queues` | Platform admins only | Admin-token guard, read-only outside local development. Also restrict at the edge if possible |
| `/api/v1` (Swagger) | Developers only | Mounted only in local development |
| PostgreSQL, Redis | The API, worker and migration job only | Passwords, optional TLS |

There is no ingress, TLS certificate or DNS record defined in the repository. The web app sets
`Strict-Transport-Security`, `upgrade-insecure-requests` and secure cookies assume HTTPS in front of
every public endpoint. See [Open items](./open-items.md).

## People

| Account | Access | Notes |
|---|---|---|
| Root platform admin | Full admin console | Created once by the seed job. Cannot be disabled. Treat its credentials as break-glass |
| Invited platform admins | Full admin console | All admins are peers. Invite and disable them from Settings. A disabled admin loses access on their next request |
| Business owners and members | Their own business | See [Roles and permissions](../services/roles-and-permissions.md) |
