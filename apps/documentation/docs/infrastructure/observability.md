---
sidebar_position: 7
---

# Observability

How to tell whether InnoPeak is healthy, and what to look at when it is not. This is the canonical
monitoring page: [Operations](../backend/operations.md) covers the application's side of the contract
and links here.

The honest summary: the application exposes **health probes, a small set of metrics, console logs and
a queue dashboard**. It does not export request metrics or queue depths, and it has no distributed
tracing. Several of the alerts you would want must therefore be built from logs, probes and database
checks until richer metrics are added.

## What phase 1 needs

The full monitoring stack is **not needed in phase 1**. What is worth having from day one is small
and mostly comes with the container platform:

1. The platform's health checks and automatic restarts (`/health/live` and `/health/ready` for the API,
   `/api/health` for the web app).
2. Access to each process's logs.
3. One uptime check on the API's `/health/ready` address.
4. An alert if the worker is not running or keeps restarting. This one matters most: the worker has no
   health endpoint, and with it stopped nothing syncs, drafts or sends while the API still looks healthy.

Prometheus, Grafana, Loki and Alertmanager can wait. The versions in the repository are only partly
usable today (see F5 to F10 in [Open items](./open-items.md)), so adopting them now would cost time for
little early value.

## What the application provides

| Signal | Where | Notes |
|---|---|---|
| Liveness | `GET /health/live` (API), `GET /api/health` (web) | Checks no dependency |
| Readiness | `GET /health` and `/health/ready` (API) | 200 when PostgreSQL and Redis answer and heap is under 90% of Node's limit, otherwise 503 with the failing component named. Cached for 2 seconds |
| Metrics | `GET /metrics` (API), bearer `METRICS_TOKEN` | See below |
| Logs | Standard output of each process | See below |
| Queues | Bull Board at `/admin/queues`, platform admins only | Waiting, active, failed and dead-lettered jobs. Read-only outside local development. With SQS, queue depth comes from the cloud console, not Bull Board |
| Error references | The `traceId` on every error response | Matches the `[ErrorID: ...]` line in the logs, so a user's report leads to the log line |
| Web errors | Sentry, when `NEXT_PUBLIC_SENTRY_DSN` is set | Events are scrubbed of cookies, credentials, query strings and personal identifiers. Session replay is off. There is no Sentry on the backend |

The worker has no HTTP server, so **it has no health or metrics endpoint**.

### Metrics

`/metrics` serves the standard Node process metrics (CPU, memory, event loop lag, garbage collection)
plus one custom counter:

| Metric | Meaning |
|---|---|
| `platform_activity_dropped_total` | An entry for the admin activity log could not be written. It is logged with its full payload so it can be replayed by hand. Alert on any increase |

**There are no request counts, durations, error rates or concurrency metrics.** The repository's
`apps/backend/apm/alerts.yml`, `rules.yml` and the Grafana dashboard query `api_requests_total`,
`api_request_duration_seconds` and `concurrent_http_requests`, which the application never exports.
Those rules never fire and those panels stay empty. See [Open items](./open-items.md).

### Logs

- **Console only.** There are no log files. Collect each container's standard output.
- **Plain text, not JSON:** `2026-10-26 09:12:03 [error] [BillingService]: message`. The level is
  coloured with terminal escape codes even in production, so a collector must strip them or match
  around them.
- **No time zone in the timestamp.** It is the process's local time. Run every process with
  `TZ=UTC` so lines from the API and worker line up.
- **Production logs `warn` and above only.** Information and debug lines, such as the confirmation that
  a purge deleted rows, are not written.
- **A 4xx answer is one `warn` line** (an expired link, a throttled request, a lapsed token). **A 5xx is
  an `error` with a stack.** Alert on `error`, not on `warn`.

The `docker-compose` stack's Promtail tails `./logs/*.log`, which the application never writes, so it
ships nothing as configured. The Jaeger and Promtail guides under `apps/backend/docs` describe tools
this application does not use.

## The monitoring stack in the repository

| Part | Where | What it gives |
|---|---|---|
| Local stack (Prometheus, Grafana, Loki, Promtail, node exporter, pushgateway, Jaeger) | `apps/backend/docker-compose.yml` | Developer-machine dashboards. Only the Node metrics are meaningful |
| Cluster stack | `k3s/monitoring-logging-stack` and the `-secured` variant | Prometheus (30-day retention, 10 Gi), Loki (15-day retention, 15 Gi), Grafana (2 Gi), Alertmanager (to Slack), blackbox exporter, Promtail and node exporter on every node |
| Staging stack (Docker on VMs) | `k3s/monitoring-logging-stack*/staging-stack` | A monitoring server and an agent bundle for the app server |

What the cluster stack alerts on today is infrastructure only: node memory, disk and CPU above 80%,
and an endpoint probe failing. It does not see an application that is up but failing.

Known problems with the shipped configuration, each also listed in [Open items](./open-items.md):

- The backend scrape job reads `/v1/metrics` in the namespace `salemate`. The application serves
  `/metrics` (without a version prefix), and the namespace is a leftover from another project.
- Prometheus does not send the bearer token that `/metrics` requires in production.
- The Alertmanager receiver is a Slack placeholder.
- Prometheus and Grafana use the `latest` tag, and Prometheus, Grafana, the blackbox exporter and
  Promtail are all published as load balancers. Pin the versions, and keep them internal.
- Only the node exporter has resource limits.

## Recommended alerts

The infrastructure alerts do not see application failure. These do, with the source you can use
**today**:

| Signal | Why it matters | Source available today |
|---|---|---|
| `GET /health/ready` failing | An instance cannot reach PostgreSQL or Redis | A blackbox probe against the endpoint |
| `error`-level log lines rising | The API or worker is failing | Loki, matching the `[error]` level |
| Worker not running | Nothing syncs, drafts or sends, and the API still looks healthy | The orchestrator's replica count or process check, since the worker has no endpoint |
| No review poll completing in 30 minutes | The worker is down, or Google is rejecting calls | A database check on `sync_runs` (latest completed run), or a log line check |
| Dead-letter queue not empty | A job exhausted its retries (a poll, a post, an email) | Bull Board, or an SQS `-dlq` depth alarm on AWS |
| Connections in `needs_reauth` rising | Owners must reconnect Google, and their reviews stop importing | A database count on connections with that status |
| Stripe webhook answering non-2xx | Plan changes are not landing. Stripe retries for days, then stops | The Stripe dashboard's webhook delivery alerts |
| `platform_activity_dropped_total` increasing | Admin activity is not being recorded | Prometheus, the one custom metric |
| PostgreSQL or Redis connection saturation | Pools are exhausted | The database and Redis provider's metrics |
| Heap near its limit | Readiness will start failing | Node metrics from `/metrics` |

Adding a request-metrics middleware (request count, duration, errors by route) would let the first
rows above become ordinary Prometheus alerts and would make the existing Grafana panels work. That is
application work, not infrastructure, and it is listed in [Open items](./open-items.md).
