---
sidebar_position: 9
---

# Open Items

Everything the documentation could not settle from the repository: decisions that need an answer,
infrastructure that does not exist yet, defects in what does exist, and a few pieces of application
work that would make operations easier. Each item has an owner and a priority so the list can be worked
through.

Priority means: **Blocker** stops a production launch, **Before launch** should be done before real
users, **Soon** can follow, and **Deferred** waits until the feature it supports is wanted (today,
sending email).

## Access status

As of October 2026.

| Access | Status |
|---|---|
| Google Business Profile API | Received. OAuth app verification (needed beyond 100 users) is still ahead |
| Azure OpenAI | Received |
| Google and Microsoft sign-in credentials | Received, implemented and working. Both are needed |
| Stripe | **Not needed in phase 1.** Payments stay switched off, and no Stripe key is needed to start in production |
| Hosting and infrastructure: cloud environment, cluster, PostgreSQL, Redis, domain, DNS and TLS | **Not received** |
| Cloudinary, Sentry | Not received (both optional) |
| Container registry and CI/CD | Not received |

## Decisions and inputs

| # | Item | Why it matters | Owner | Priority |
|---|---|---|---|---|
| D1 | **Cloud and region.** The code defaults to AWS `us-east-1`. `apps/backend/docs/PLAN.md` (line 650) says the database and log storage must also sit in an EU region, as the AI provider already must (`westeurope` or `northeurope`) | Reviewer names are personal data under GDPR. This decides where PostgreSQL, Redis and logs live | Client, devops | Blocker |
| D2 | **Deployment platform and target.** AWS with `DEPLOYMENT_TARGET=aws` (SQS and Secrets Manager), or the k3s cluster with `local` (BullMQ on Redis) | Changes which queue, secrets and IAM work is needed. See [Environments](./environments.md) | Devops | Blocker |
| D3 | **Staging mode.** A staging box running as `NODE_ENV=development` never sends email. Running it as `production` applies every production check | Decides whether staging can verify sign-ups and invitations | Devops | Before launch |
| D4 | **Backup policy and RPO/RTO** for PostgreSQL (and whether to snapshot Redis) | Nothing in the repository covers it. See [Data stores](./data-stores.md) | Client, devops | Blocker |
| D5 | **Vendor account owners and support contacts** for Google Cloud (Business Profile, sign-in), Microsoft Entra, Stripe, Azure OpenAI, Cloudinary, the email provider and Sentry | The [external services](../services/external-services.md) page has a column for them that is empty | Client | Before launch |
| D6 | **Domains and hostnames,** and whether the web app and API share an origin. TLS certificate source | The OAuth redirect addresses, `CORS_ORIGINS`, `FRONTEND_URL` and `TRUST_PROXY_HOPS` all follow from this | Devops | Blocker |
| D7 | **Secret naming and rotation.** Settings use the prefix `nestjs-app/`, Google tokens use `innopeak/`. Who rotates what, how often | See [Secrets and access](./secrets-and-access.md) | Devops | Before launch |
| D8 | **Email provider and sender address** (`EMAIL_PROVIDER`, `EMAIL_FROM`), when an email service is wanted | Deferred: not needed to start, because business users sign in with Google or Microsoft. It is needed for invitations, the code that confirms deleting a business, and deletion notices. `EMAIL_FROM` defaults to `noreply@example.com`, so set it when email is added | Client, devops | Deferred |
| D9 | **Release branch, registry and environments.** Merge requests target `development`, while the CI file keys on `main` | A pipeline cannot be written until these are fixed | Devops | Before launch |

## Missing infrastructure

| # | Item | Notes | Owner | Priority |
|---|---|---|---|---|
| M1 | **Production infrastructure as code:** network, PostgreSQL 18 or newer, Redis with persistence, secrets, IAM | The only Terraform is the emulator test stack in `infra/floci`. See [Overview](./overview.md#recommended-production-shape) | Devops | Blocker |
| M2 | **Hosting plan for the documentation site** | The web app image now exists (`apps/web/Dockerfile`, standalone output). The documentation site still has no image; it builds to static files. `API_URL` is fixed at build time, so each environment needs its own web build | Devops, app team | Blocker |
| M3 | **Worker deployment** | A second workload on the backend image, started with `node dist/worker.main.js`, with no HTTP probe | Devops | Blocker |
| M4 | **Image registry and a working CI/CD pipeline** that builds, tests, migrates and rolls out | See [Deployment and releases](./deployment-and-releases.md#state-of-the-automation) | Devops | Blocker |
| M5 | **Ingress, TLS and DNS** | Nothing is defined. The web app's headers and cookies assume HTTPS | Devops | Blocker |
| M6 | **Kubernetes hardening:** Secrets instead of a ConfigMap, probes on the backend, a pod disruption budget, autoscaling, network policies | The k3s manifests are templates with placeholders such as `<image-uri>` and `<namespace-name>` | Devops | Before launch |
| M7 | **Backups and a tested restore** | See D4 | Devops | Blocker |
| M8 | **Log collection from standard output** and application alerts | Promtail in the Compose stack tails files the application never writes. See [Observability](./observability.md) | Devops | Before launch |
| M9 | **Email delivery set-up** (an SMTP relay, or SES identities and sending limits) | Deferred with D8. SES is not provisioned by the Terraform | Devops | Deferred |

## Defects in existing material

Things that exist in the repository but are wrong, listed with the fix.

### Containers and build

| # | Defect | Fix | Priority |
|---|---|---|---|
| F1 | ~~The Dockerfile copies `apps/backend/pnpm-lock.yaml`, which is git-ignored, so a clean checkout cannot build the image. It also activates pnpm 8.15.0 while the repository root declares `pnpm@10.15.0`~~ | Resolved: both Dockerfiles build from the repository root with the tracked lockfile and activate pnpm 10.15.0 | Done |
| F2 | ~~The image's `HEALTHCHECK` calls the API's `/health`, so a worker started from it is always unhealthy under plain Docker~~ | Resolved: documented that the worker must override or disable the health check; Kubernetes uses its own probes | Done |
| F3 | ~~The final image contains the development dependencies~~ | Resolved: a separate `prod-deps` stage installs production dependencies only | Done |
| F4 | ~~Node versions disagree: backend 20, web 24, root `.nvmrc` 20~~ | Resolved: every runtime and CI pin is now Node 24.22.1 (patched for the October 2026 CVEs) | Done |

### Monitoring and alerting

| # | Defect | Fix | Priority |
|---|---|---|---|
| F5 | The Prometheus scrape job for the backend reads `/v1/metrics` in namespace `salemate`. The app serves `/metrics` and the namespace is left over from another project | Correct the path and namespace | Before launch |
| F6 | Neither Prometheus nor the nginx sidecar in `k3s/apps/backend` sends the `METRICS_TOKEN` bearer token, so production `/metrics` answers 401 | Add the token to the scrape configuration | Before launch |
| F7 | `apm/alerts.yml`, `apm/rules.yml` and the Grafana dashboard use `api_requests_total`, `api_request_duration_seconds` and `concurrent_http_requests`, which the application never exports | Remove them, or add the metrics (A1) | Before launch |
| F8 | Alertmanager's receiver is the placeholder `https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK` | Configure a real receiver | Before launch |
| F9 | Prometheus and Grafana use the `latest` tag, and Prometheus, Grafana, the blackbox exporter and Promtail are load balancers. The staging `.env.example` sets the Grafana admin password to `admin`. Only the node exporter has resource limits | Pin versions, keep them internal, change the password, set limits | Before launch |
| F10 | The Compose stack's Promtail tails `./logs/*.log`, which the application never writes. Jaeger and `OTEL_*` settings exist but nothing emits traces. `apps/backend/docs` Jaeger and Promtail guides describe unused tools | Remove, or collect standard output instead | Soon |

### Cloud definitions

| # | Defect | Fix | Priority |
|---|---|---|---|
| F11 | The IAM policy in `infra/floci/iam.tf` lacks `sqs:ChangeMessageVisibility` (a job longer than 60 s then runs twice), the Secrets Manager write actions for `innopeak/<environment>/review-credentials` (connecting Google fails in production), and `ses:SendRawEmail`. The emulator does not enforce IAM, so none of this has surfaced | Grant them in the real policy | Blocker |
| F12 | The Terraform provisions PostgreSQL 17, but the schema needs 18 (`uuidv7()`). It also provisions an S3 bucket nothing uses. The warning about a pgvector migration in `apps/backend/README.md` is out of date | Use 18, drop the bucket, update the README | Before launch |

### Runtime configuration

| # | Defect | Fix | Priority |
|---|---|---|---|
| F13 | The worker does not pin `TZ`, and it fires the scheduled jobs. Log timestamps carry no time zone | Set `TZ=UTC` on every process, or pin it in `worker.main.ts` as `main.ts` does | Before launch |
| F14 | The k3s backend template has no probes, no container port and no worker. A read-only root filesystem makes `copyStaticAssets()` log an error at every API start (harmless) | Fill the template in, add the worker, and remove the call | Before launch |
| F15 | `apps/backend/.env.example` says `FRONTEND_URL` is "not read by the backend yet" (it is read in eight services), mentions a `platform_settings.billing_enabled` flag that does not exist, lists the unused `REVIEW_SYNC_QUEUE_URL`, and calls Cloudinary "required in production" when nothing enforces it. `apps/web/.env.example` mentions PostHog and GTM, which are not used, and its `NEXT_PUBLIC_APP_URL` port disagrees with the code | Correct the comments | Soon |
| F16 | The comment in `env-config.schema.ts` makes the same "not read by the backend" claim about `FRONTEND_URL` | Correct the comment | Soon |

## Application work that would help operations

These are code changes, not infrastructure, but operations are harder without them.

| # | Suggestion | Benefit | Priority |
|---|---|---|---|
| A1 | **Request metrics** (count, duration, errors by route) and **queue depth** gauges on `/metrics` | Makes the Grafana dashboards and ordinary alerts work (F7) | Before launch |
| A2 | **A health or heartbeat signal for the worker** (a small port, or a metric) | Today an orchestrator cannot tell a stuck worker from a healthy one | Before launch |
| A3 | **Require `EMAIL_FROM` once an email service is used** | Prevents mail leaving from `example.com` (D8). Not before then, or a production start with no email service would be refused | Soon |
| A4 | **Make the Cloudinary settings required in production**, if profile pictures are a launch feature | Today a missing value only fails at the first upload | Soon |
| A5 | **Remove or implement the `daily-mail` job.** It runs every night and only writes a log line | Removes noise from the schedule | Soon |
| A6 | **Correct the `autoPostEnabled` API description,** which says approval is still required, when the code posts a non-escalated draft automatically. Give it a console control or remove it | Avoids a hidden, misdocumented switch | Soon |
| A7 | **Build email and Teams notification delivery,** or hide the recipients settings | The platform switch for notification settings cannot be turned on until then | Soon |
| A8 | **Dependency advisories.** `pnpm audit` reports upgrades for packages the backend ships, such as `body-parser`, `multer`, `nodemailer` and `undici` | Keep the production image free of known issues | Before launch |
| A9 | **Do not retry email jobs when there is no email service.** In production with none configured, the SMTP sender falls back to `localhost:587`, so every email job fails, is retried and is recorded in the dead-letter queue. Use the no-op sender (which logs) when no host or sender is set, or skip queuing | Keeps the dead-letter queue meaningful while email is deferred (D8) | Before launch |
