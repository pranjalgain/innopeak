# Built from the repository root so the workspace lockfile and the shared `libs/` are in context:
#
#   docker build -f apps/backend/Dockerfile -t innopeak-backend .
#
# One image serves the API (`node dist/main.js`), the worker (`node dist/worker.main.js`) and the
# migration job (`node dist/db/drizzle/migrate.js`); override CMD per process.

ARG NODE_VERSION=24.22.1
ARG PNPM_VERSION=10.15.0

# ─── Base ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ─── Manifests ──────────────────────────────────────────────────────────────
# Only the package files first, so the install layers cache when source changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/web/package.json ./apps/web/
COPY libs/client_sdk/package.json ./libs/client_sdk/

# ─── Dependencies (build) ───────────────────────────────────────────────────
FROM manifests AS deps
RUN pnpm install --frozen-lockfile

# ─── Build ──────────────────────────────────────────────────────────────────
FROM deps AS build
COPY apps/backend ./apps/backend
RUN pnpm --filter backend build:api

# ─── Production dependencies ────────────────────────────────────────────────
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter backend

# ─── Production ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# `dist` carries the compiled code, the email templates and the SQL migrations (see nest-cli.json).
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/backend/dist ./dist
COPY --from=build --chown=node:node /app/apps/backend/views ./views
COPY --from=build --chown=node:node /app/apps/backend/assets ./assets
COPY --chown=node:node apps/backend/package.json ./package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Default: run the API server. Override with CMD ["node", "dist/worker.main.js"] for the worker,
# or ["node", "dist/db/drizzle/migrate.js"] for the one-shot migration job.
CMD ["node", "dist/main.js"]
