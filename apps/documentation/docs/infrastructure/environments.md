---
sidebar_position: 2
---

# Environments

InnoPeak behaves differently depending on three things: `NODE_ENV`, `DEPLOYMENT_TARGET`, and whether
`FRONTEND_URL` points at a local address. This page lists the environments the repository supports
and exactly what changes between them, so a surprise such as "staging sends no email" is explained in
advance.

## The environments

| Environment | What it is | How to start it | Defined in the repository |
|---|---|---|---|
| **Local** | A developer machine. PostgreSQL, Redis and a monitoring stack in Docker, the API and worker as Node processes | `pnpm local:up` | `apps/backend/docker-compose.yml` |
| **AWS-emulated** | A local test of the AWS paths (SQS, Secrets Manager) against the Floci emulator, provisioned with Terraform | `pnpm local:aws:up` | `apps/backend/docker-compose.floci.yml`, `apps/backend/infra/floci` |
| **Staging** | A shared pre-production box | not defined | only the monitoring side, in `k3s/monitoring-logging-stack*/staging-stack` |
| **Production** | The live system | not defined | only the application-side contract, in [Operations](../backend/operations.md) |

For staging and production the repository holds no hosts, regions, domains or sizes. Those belong to
the devops team and are tracked in [Open items](./open-items.md).

### Local

`pnpm local:up` generates the Prometheus configuration, starts the Docker services, waits, applies the
migrations, seeds the root admin and starts the API and worker together (`pnpm start:dev`).

The Docker services are PostgreSQL 18, Redis (password required, append-only persistence), Prometheus,
a push gateway, Grafana, Loki, Promtail, a node exporter and Jaeger. Only PostgreSQL and Redis are
needed to run the application. The PostgreSQL container is set to `trust` authentication, so it
must never be exposed beyond the developer's machine.

### AWS-emulated

`pnpm local:aws:up` starts [Floci](https://floci.io), an AWS-compatible emulator, then runs the
Terraform in `apps/backend/infra/floci`, then starts the app with `DEPLOYMENT_TARGET=aws`. It exists
to exercise the SQS queue transport and the Secrets Manager settings load before they are used for
real. The Terraform provisions:

| Resource | Detail |
|---|---|
| RDS PostgreSQL | version 17, `db.t3.micro`, 20 GB, publicly accessible, no backups |
| ElastiCache Redis | version 7.0, `cache.t3.micro`, one node |
| SQS | four queues (`email`, `dead-letter`, `cron`, `review-post`), each with a `-dlq` queue. Visibility timeout 60 s, three receives before redrive, 14-day retention on the `-dlq` |
| Secrets Manager | one secret, `nestjs-app/<environment>`, holding the computed database, Redis and queue values plus the app secrets |
| S3 | a media bucket that nothing in the application uses |
| IAM | a role allowing the secret, SQS and S3 |

This is **a test stack only**, with dummy credentials and endpoints at `localhost:4566`. It must not
be treated as a template for production. Two things to know before relying on it:

- The application needs **PostgreSQL 18 or newer** (the migrations use the built-in `uuidv7()`), but
  this Terraform asks for version 17. Migrations have not been verified against that version.
- The warning in `apps/backend/README.md` about a pgvector migration is out of date: that module no
  longer exists.

## What changes between environments

| Behaviour | Local | AWS-emulated | Staging, running as `development` | Production |
|---|---|---|---|---|
| `NODE_ENV` | `development` | `development` | `development` | `production` |
| `DEPLOYMENT_TARGET` | `local` | `aws` | `local` or `aws` | `local` or `aws` |
| **Email is actually sent** | No (logged) | No (logged) | **No (logged)** | Yes |
| Where Google tokens are stored | Redis, encrypted with `CREDENTIAL_ENCRYPTION_KEY` | Secrets Manager | Redis | Secrets Manager |
| Queue transport | BullMQ | SQS (except `review-sync`) | BullMQ or SQS | BullMQ or SQS |
| Settings loaded from Secrets Manager | No | Yes | Only when `aws` | Only when `aws` |
| Swagger at `/api/v1` | Yes | Yes | No | No |
| Queue dashboard can retry and delete jobs | Yes | Yes | No (read-only) | No (read-only) |
| `/metrics` without a token | Open | Open | Refused (503) | Refused (503), and a token is required to boot |
| Fixed sign-up code (`DEV_VERIFY_EMAIL_TOKEN`) | Allowed | Allowed | Refused at boot | Refused at boot |
| Cookies marked `Secure` | No (plain http) | No | Yes if `FRONTEND_URL` is https | Yes |
| Boot-time production checks (secrets, `TRUST_PROXY_HOPS`, `METRICS_TOKEN`) | Not applied. A shipped placeholder secret only logs a warning | Same | Same | **Enforced** |

"Local" in the middle rows means `NODE_ENV` is not `production` **and** `FRONTEND_URL` is unset or a
loopback address (`isLocalDevelopment()`). A staging box that runs as `development` must set
`FRONTEND_URL` to its real address, or it is treated as a laptop: open Swagger and queue dashboard,
fixed sign-up code allowed.

:::warning A staging box running as `development` sends no email
Real email delivery starts only when `NODE_ENV=production`. If staging has to deliver verification
codes and invitations, run it with `NODE_ENV=production`, which also applies every production check
(strong distinct secrets, `METRICS_TOKEN`, `TRUST_PROXY_HOPS`). Decide this explicitly
when staging is built.
:::

## Choosing the target for a real deployment

`DEPLOYMENT_TARGET=aws` is documented as the way to run on AWS, but it is currently exercised only
against the emulator. It switches four things: queues go through SQS, settings are loaded from one
Secrets Manager secret at start-up, AWS clients can be pointed at an endpoint override, and the
Google token store is Secrets Manager. A deployment on another platform (for example the k3s
cluster) uses `local`, where BullMQ on Redis carries every queue. Both are valid; pick one per
environment and record it in [Open items](./open-items.md).
