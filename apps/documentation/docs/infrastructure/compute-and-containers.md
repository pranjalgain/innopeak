---
sidebar_position: 3
---

# Compute and Containers

What runs, in what container, with how much CPU and memory. Where the repository already defines
something, this page states it. Where it does not, the page gives a recommendation and says what it
is based on. No load test exists in the repository, so every recommended size is a **starting point to
adjust from observed usage**, not a measured requirement.

## What needs to run

| Process | Replicas | Exposed | Needs |
|---|---|---|---|
| **API** | 1 minimum, 2 recommended | Port 3000, through the load balancer | PostgreSQL, Redis, outbound internet (Stripe, Google, Cloudinary, the AI provider) |
| **Worker** | 1, or 2 for availability | Nothing: no port, no probe endpoint | PostgreSQL, Redis, outbound internet (Google, the AI provider, email) |
| **Web app** | 1 minimum, 2 recommended | Its own port, through the load balancer | The API's address, fixed at build time |
| **Migration job** | 1, once per release | Nothing | PostgreSQL |

The documentation site is static files and needs no running process.

## The backend image

One image serves the API, the worker and the migration job. `apps/backend/Dockerfile` builds it from
the **repository root**, on `node:24.22.1-alpine` with pnpm 10.15.0 (the version the root
`package.json` pins). Build it with the root as context so the workspace lockfile and the shared
`libs/` are available:

```bash
docker build -f apps/backend/Dockerfile -t innopeak-backend .
```

The stages are:

1. Copy only the workspace manifests (root, `apps/backend`, `apps/web`, `libs/client_sdk`) and run
   `pnpm install --frozen-lockfile`, so the install layer caches while source changes.
2. Copy `apps/backend` and build with `pnpm --filter backend build:api` (compile, rewrite path
   aliases, copy views, assets, email templates and SQL migrations).
3. A separate `prod-deps` stage installs production dependencies only
   (`pnpm install --frozen-lockfile --prod --filter backend`); the final image receives that
   `node_modules`, the compiled `dist` and the static `views`/`assets`. It runs as the unprivileged
   `node` user and exposes port 3000.

The default command starts the API (`node dist/main.js`). **Start the worker from the same image by
overriding the command** to `node dist/worker.main.js`. The migration and seed jobs are also commands
on this image: `node dist/db/drizzle/migrate.js` and `node dist/db/seeds/seed-platform-admin.js`.

The image's `HEALTHCHECK` probes the API's HTTP endpoint. Kubernetes ignores `HEALTHCHECK` and uses
its own probes; for a plain Docker or Compose worker container, disable or override it, since the
worker has no HTTP server and would otherwise be reported unhealthy.

## The web image

`apps/web/Dockerfile` builds the web app from the same repository root, on the same Node 24.22.1 base
image and pnpm version:

```bash
docker build -f apps/web/Dockerfile -t innopeak-web \
  --build-arg API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_APP_ENV=production \
  --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com .
```

`next.config.ts` sets `output: "standalone"`, so the final image carries only the traced server
bundle plus `.next/static` and `public` — not the workspace or the development dependencies. It runs
as `node`, listens on port 3000 (`PORT`) on `0.0.0.0` and starts `apps/web/server.js`.

`API_URL` (the `/v1` rewrite target) and the `NEXT_PUBLIC_*` values are inlined when `next build`
runs, so each environment needs its own build, or all of them must share one API address. Sentry
source-map upload uses the `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` build arguments. See
[Web app](../services/web-app.md).

The root `.dockerignore` keeps `node_modules`, build output, local environment files and the
infrastructure/documentation trees out of both build contexts while leaving every workspace manifest
and the root `pnpm-lock.yaml` in.

## Resources

### Defined in the repository

The k3s templates (`k3s/apps/*/manifest.yml`) are the only place resources are set. Everything else
runs with no limits.

| Workload | Replicas | CPU request / limit | Memory request / limit |
|---|---|---|---|
| Backend (template, one container) | 1 | 1000m / 2000m | 1024Mi / 2048Mi |
| Frontend (template) | 1 | 1000m / 1000m | 1024Mi / 2048Mi |
| Worker | none defined | | |

The Docker Compose files set no CPU or memory limits on any service.

### Recommended starting point

| Workload | Replicas | CPU request / limit | Memory request / limit | Basis |
|---|---|---|---|---|
| API | 1 minimum, 2 recommended | 500m / 1000m | 512Mi / 1024Mi | The template's request halved: one process, JSON API, 10 database connections |
| Worker | 1 (2 for availability) | 500m / 1000m | 512Mi / 1024Mi | Concurrency is low by design (see [Capacity and scaling](./capacity-and-scaling.md#queue-workers)) |
| Web | 1 minimum, 2 recommended | 500m / 1000m | 512Mi / 1024Mi | Server-rendering a console behind a proxy |

One copy of the API or the web app is enough to run. The second is for availability, not capacity: it
keeps the service answering during a restart, a crash or a deploy. Where a short outage at those moments
is acceptable, as it may be in phase 1, start with one.

These are deliberately lower than the template, which asks for a full CPU and 1 GiB per replica for
what is a small service. Treat both as guesses, and revisit after the first week of real traffic.

Two settings keep the numbers honest:

- **Set the Node heap explicitly**, for example `NODE_OPTIONS=--max-old-space-size=768` for a 1 GiB
  limit (about 75%). Nothing sets it today, and the readiness probe fails when heap use passes 90% of
  Node's limit. A heap limit close to the container limit gets the process killed before the probe can
  react.
- **Give pods at least 30 seconds to terminate** (`terminationGracePeriodSeconds`). The API finishes
  in-flight requests on `SIGTERM`, and an SQS consumer waits up to 25 seconds for its current job.

### Probes

| Workload | Liveness | Readiness |
|---|---|---|
| API | `GET /health/live` | `GET /health/ready` |
| Worker | none available. Use a process check, or restart on crash | none |
| Web | `GET /api/health` | `GET /api/health` (it checks nothing downstream) |

The k3s backend template has no probes at all, and the frontend template has placeholder paths.

## Ports

| Port | Process | Purpose | Expose to |
|---|---|---|---|
| 3000 (`PORT`) | API | HTTP, including `/metrics` and `/admin/queues` | The load balancer. Restrict `/metrics` and `/admin/queues` at the edge as well as in the application |
| web port | Web app | Pages | The load balancer |
| none | Worker | | Nothing |
| 5432 | PostgreSQL | | The API, worker and migration job only |
| 6379 | Redis | | The API and worker only |
