# Built from the repository root: the web app is a pnpm workspace member and imports the shared
# `libs/client_sdk` package, so the root lockfile and workspace manifests must be in context.
#
#   docker build -f apps/web/Dockerfile -t innopeak-web \
#     --build-arg API_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_APP_ENV=production \
#     --build-arg NEXT_PUBLIC_APP_URL=https://app.example.com .
#
# API_URL and the NEXT_PUBLIC_* values are inlined into the build (the `/v1` rewrite and the browser
# bundle), so each environment needs its own image.

ARG NODE_VERSION=24.22.1
ARG PNPM_VERSION=10.15.0

# ─── Base ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ─── Manifests ──────────────────────────────────────────────────────────────
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/backend/package.json ./apps/backend/
COPY libs/client_sdk/package.json ./libs/client_sdk/

# ─── Dependencies ───────────────────────────────────────────────────────────
FROM manifests AS deps
RUN pnpm install --frozen-lockfile

# ─── Build ──────────────────────────────────────────────────────────────────
FROM deps AS build
ARG API_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_ENV=production
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_TITLE=InnoPeak
ARG NEXT_PUBLIC_APP_NAME=InnoPeak
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV API_URL=${API_URL} \
    NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_APP_TITLE=${NEXT_PUBLIC_APP_TITLE} \
    NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME} \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT}

COPY apps/web ./apps/web
COPY libs/client_sdk ./libs/client_sdk
RUN pnpm --filter web build

# ─── Production ─────────────────────────────────────────────────────────────
# `output: "standalone"` is set in next.config.ts: the runtime image needs only the traced server
# bundle plus the static assets, not the workspace or the dev dependencies.
FROM node:${NODE_VERSION}-alpine AS production
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
