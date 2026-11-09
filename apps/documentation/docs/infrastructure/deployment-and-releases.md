---
sidebar_position: 8
---

# Deployment and Releases

How a release gets from a commit to running software: what to build, the order to roll it out, how to
undo it, and the state of the automation. The application's side of this is in
[Operations](../backend/operations.md). The repository does not yet contain a working pipeline, so
this page describes the procedure to automate as much as the automation that exists.

## Build

| Artifact | Command | Output |
|---|---|---|
| Backend (API and worker) | `pnpm run build:api` in `apps/backend` | `dist/`, including `dist/main.js` and `dist/worker.main.js`, with views and assets copied in |
| Backend, in a container | `docker build -f apps/backend/Dockerfile -t innopeak-backend .` from the repository root | One image for the API, worker and migration job. See [Compute and containers](./compute-and-containers.md#the-backend-image) |
| Web app | `pnpm --filter web build` (`next build`) | `.next/`. **Set `API_URL` for the target environment first**: it is baked into the build |
| Web app, in a container | `docker build -f apps/web/Dockerfile ... .` from the repository root | A standalone Next.js runtime image. See [Compute and containers](./compute-and-containers.md#the-web-image) |
| Documentation | `pnpm docs:build` | Static files in `apps/documentation/build`. The build fails on a broken link |
| Generated API client | `pnpm generate:sdk` | `libs/client_sdk`. Regenerate whenever the backend's request or response shapes change |

Use `pnpm install --frozen-lockfile`. Every runtime and CI pin is Node 24.22.1 and the images activate
the root-declared pnpm 10.15.0.

## Release order

For a release that includes a database change:

1. **Build and tag** the backend and web images from the same commit.
2. **Run the migration job** once, from the new backend image: `pnpm db:migrate:prod`
   (`node dist/db/drizzle/migrate.js`). It must finish successfully before anything else changes. It
   exits non-zero on failure, which should stop the pipeline.
3. **Roll out the API.** A rolling update with zero unavailable replicas keeps the service up. Wait for
   `GET /health/ready` to pass on the new replicas.
4. **Roll out the worker.** On shutdown it stops taking jobs and gives the job in hand up to 25 seconds
   to finish, so allow at least 30 seconds before the pod is killed. A job that does not finish is
   offered again.
5. **Roll out the web app.**
6. **Smoke test:** sign in as a business user and as an admin, open the reviews page, and confirm the
   queue dashboard shows the worker consuming jobs.

The API is rolled out before the worker and the web app, so a new web version never calls an API route
that does not exist yet.

### First deployment of an environment

In addition to the above, once per environment:

1. Provision PostgreSQL 18 or newer and Redis with persistence. See [Data stores](./data-stores.md).
2. Set every required variable. See [Configuration reference](../services/configuration-reference.md).
   Production will refuse to start on a missing or placeholder secret, which is the intended check.
3. Run `pnpm db:seed:admin:prod` with `ROOT_ADMIN_EMAIL` and `ROOT_ADMIN_PASSWORD` set. It is safe to
   repeat: an existing root admin is left unchanged.
4. Register the **redirect addresses** with each provider so they match the settings exactly:
   `GBP_CALLBACK_URL` and `GOOGLE_CALLBACK_URL` in the Google Cloud console,
   `MICROSOFT_CALLBACK_URL` in Entra. They point at the **web app's** public address, because the
   browser returns through the `/v1` proxy.
5. Once payments are switched on (not in phase 1), register the Stripe webhook,
   `POST /v1/billing/webhooks/stripe`, in the Stripe dashboard, and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.
6. Set `FRONTEND_URL` to the web app's public address. It builds the links in emails and decides whether
   the environment is treated as local.

## Rolling back

- **Application:** deploy the previous image tag. The API and worker are stateless, so this is safe at
  any time.
- **Database:** migrations only move forward. There is no down migration, and a released migration must
  never be edited. Because the old version keeps running while the new one rolls out, **write
  migrations so the previous release still works against them**: add columns and tables first, and remove
  or rename in a later release once nothing uses the old shape.
- **Queued jobs** are kept in Redis (or SQS) across a rollout. A job published by the new version may
  be consumed by the old worker, so keep job payloads backwards compatible for one release.

If a migration fails part-way, fix forward or restore from backup. Do not edit an applied migration:
the migrator never re-reads one, so the edit does nothing on a database that already has it.

## State of the automation

| Item | Status |
|---|---|
| `.gitlab-ci.yml` | **Does not match this repository.** It runs `yarn` and `prisma:setup`, refers to `apps/frontend` and workspaces that do not exist, runs no tests, linting or type-check, and its two deploy jobs only print a message. Its rules key on the `main` branch, while merge requests here target `development` |
| `apps/web/.github/workflows` and `apps/web/.gitlab-ci.yml` | Inside `apps/web`, so neither GitHub nor GitLab runs them. The GitLab include paths they refer to do not exist |
| Image build and push | None |
| Deploy | None. The only script is `k3s/monitoring-logging-stack/deploy/deploy.sh`, which installs the monitoring stack over SSH |
| Security scanning | Scripts exist (`pnpm security:trivy`, `pnpm security:gitleaks`, a pre-commit hook) but nothing runs them in CI |

### What a working pipeline needs

Per merge request and on the release branch:

1. `pnpm install --frozen-lockfile`
2. Backend: `pnpm type-check`, `pnpm test`, `pnpm run build:api`, and `pnpm db:migrations:verify`
   (fails if a released migration was edited)
3. Web: `pnpm --filter web type:check`, `test:run`, `lint` and `build`
4. Documentation: `pnpm docs:build`
5. Security scan: `pnpm security:scan`

On the release branch, additionally: build and push the images, run the migration job against the
target environment, then roll out in the order above. The target branch, registry and environments
are decisions for the devops team. See [Open items](./open-items.md).
