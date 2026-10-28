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

One image serves both the API and the worker. It is built by `apps/backend/Dockerfile` in three
stages, on `node:20-alpine` with pnpm 8.15.0:

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Build with `pnpm run build:api` (compile, rewrite path aliases, copy views and assets).
3. Copy `node_modules` and `dist` into the final image, run as the unprivileged `node` user, expose
   port 3000.

The default command starts the API (`node dist/main.js`). **Start the worker from the same image by
overriding the command** to `node dist/worker.main.js`. The migration and seed jobs are also commands
on this image: `node dist/db/drizzle/migrate.js` and `node dist/db/seeds/seed-platform-admin.js`.

### Problems to fix before using it

| Problem | Effect | Fix |
|---|---|---|
| The Dockerfile copies `pnpm-lock.yaml` from `apps/backend`, but that file is git-ignored (`apps/backend/.gitignore`). The tracked lockfile is the repository root's | A build from a clean checkout fails at `COPY` | Build from the repository root with a Dockerfile that uses the root lockfile, or stop ignoring the file |
| The built-in `HEALTHCHECK` calls `http://127.0.0.1:3000/health` | A worker container has no HTTP server, so Docker marks it permanently unhealthy | Override or disable the health check for the worker. Kubernetes ignores `HEALTHCHECK`, so this affects plain Docker and Compose |
| The final stage copies the whole `node_modules`, development dependencies included | A larger image and a larger attack surface | Prune to production dependencies in the final stage |
| An empty `logs` directory is created | Unused: the application writes logs to the console only | Remove |
| `copyStaticAssets()` copies `views` and `assets` into `dist` at every API start | On a read-only root filesystem it logs an error and carries on (the app does not use the copy) | Harmless; remove the call, or keep a writable `dist` |

## The web image

There is none. Two facts matter when one is written:

- The web app declares `node >= 24` (`apps/web/package.json`), while the backend image and the
  repository's `.nvmrc` use Node 20. Build it on its own base image, not the backend's.
- `API_URL` is fixed when `next build` runs, so each environment needs its own build, or all of them
  must share one API address. See [Web app](../services/web-app.md).

`next.config.ts` does not set `output: 'standalone'`. Setting it produces a much smaller runtime
image than shipping the whole workspace.

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
