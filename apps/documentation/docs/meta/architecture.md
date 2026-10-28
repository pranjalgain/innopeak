# Project Architecture

## System Overview

InnoPeak helps a business owner keep up with their Google Business Profile reviews: it imports reviews, classifies each one
(auto-reply candidate or escalation), drafts replies with an LLM, lets a person approve or edit them, and posts the approved reply
back to Google. A platform-admin console runs the platform; Stripe provides the Free/Paid plans.

```plaintext
Browser ──► apps/web (Next.js 16) ──/v1/* rewrite──► apps/backend API (NestJS 11)
                                                        │   │
                       PostgreSQL (Drizzle, SQL-first) ◄┘   └─► Redis ─► BullMQ / SQS queues ─► worker (same codebase)
                                                                                   │
        Google Business Profile ◄── poll, backfill, reply ─────────────────────────┤
        AI provider (Azure OpenAI, EU region; or OpenRouter) ◄── generate ─────────┤
        Stripe (Checkout, Portal, webhooks) ◄──► API        Cloudinary (avatars, direct upload) ◄──► API
```

- **API** (`apps/backend`, `src/main.ts`): stateless HTTP under `/v1`, JWT in httpOnly cookies, four-layer modules
  (Controller → Service → DB Service → Repository, see `apps/backend/docs/conventions/module-structure.md`).
- **Worker** (`src/worker.main.ts`): the same codebase started as a queue consumer and cron scheduler. A `review-sync-poll` cron
  tick every 15 minutes fans out per location into the review-sync queue; each run imports reviews, classifies them, generates AI
  drafts and notifies. Approved replies post through the review-post queue with retry. Nightly jobs reconcile deleted reviews and
  purge erased businesses. See [Review Pipeline](../backend/review-pipeline/overview.md).
- **Web** (`apps/web`): tenant dashboard/review queue/settings and the admin console. It calls the API through the generated client in
  `libs/client_sdk`; `next.config.ts` rewrites `/v1/*` to the API so auth cookies stay first-party.
- **Two principals**: tenant users (`owner`, `member`) and platform admins, with separate login screens, tokens and routes.
- **Deploy-level settings** (for example `PAYMENT_FEATURE_ENABLED`, `ERASURE_GRACE_PERIOD_DAYS`) come from environment variables and
  are reflected to the web through `GET /v1/settings/platform-config`, never copied into the web app.

## Technology Stack

### Core Technologies

- **Package manager**: pnpm workspaces; **runtime** Node.js >= 20; **language** TypeScript (very strict) throughout
- **Backend**: NestJS 11, Drizzle ORM over PostgreSQL (raw SQL migrations first), Redis, BullMQ locally and SQS in the AWS-emulated
  target (`DEPLOYMENT_TARGET`), Joi-validated environment
- **Web**: Next.js 16 App Router, React 19, TanStack Query, react-hook-form + zod, next-intl (English and German), Tailwind and Radix
- **Integrations**: Google Business Profile (OAuth, reviews, replies), Azure OpenAI by default or OpenRouter (LLM), Stripe, Cloudinary, SMTP/SES email
- **Documentation**: Docusaurus (this site)

### Development Tools

- **Linting/formatting**: ESLint and Prettier (run them on the files you changed, not whole directories)
- **Testing**: Jest (backend), Vitest + Testing Library (web), Playwright for E2E
- **Observability**: Prometheus metrics at `/metrics`, console-only logs, Sentry for web errors; a 4xx is logged at `warn`, only a 5xx at `error`

## Monorepo Structure

```plaintext
/
├── apps/
│   ├── backend/          # NestJS API + worker            (rules: apps/backend/CLAUDE.md)
│   ├── web/              # Next.js tenant + admin consoles (rules: apps/web/AGENTS.md)
│   └── documentation/    # This Docusaurus site            (rules: apps/documentation/AGENT.md)
├── libs/
│   └── client_sdk/       # Generated TypeScript client for the API
├── CLAUDE.md             # Monorepo-wide instructions
├── package.json          # Root workspace configuration
└── pnpm-workspace.yaml   # Workspace definition
```

## Application Patterns

### Backend

- One module per domain under `src/api/<module>/` with `controllers/`, `services/`, `dto/`, `swagger/`, `constants/`, `types/`; data access
  centralised in `src/db/repositories/<domain>/` (Repository = Drizzle queries only, DB Service = composition and transactions)
- Providers behind abstract classes for anything external (payments, storage, AI, email, queue transport)
- Every user-facing string is a tagged message with English and German entries, rendered at the edge in the request's locale
  ([Multilingual](./multilingual.md))
- Repeated or racing actions are idempotent (webhook ledger, no-op repeats on admin actions, single-use tokens)

### Web

- Server state in the shared TanStack Query cache; list page, filters and search live in the URL so Back/Forward and reload keep your place
- One request per user action; guarded pages remember where you were headed after sign-in
- See [Frontend overview](../frontend/overview.md) and [Admin console](../frontend/admin-console.md)

### Shared Libraries

- `libs/client_sdk` mirrors the backend's OpenAPI; a DTO change updates the SDK model (and the web's `types/domain.ts`) in the same change

## Development Workflow

1. **Setup**: Clone repository and run `pnpm install`
2. **Development**: Use workspace-specific commands
3. **Testing**: Run tests across all applications
4. **Documentation**: Update docs for any changes
5. **Build**: Build all applications for production

## Deployment Strategy

- **Processes**: the API and the worker are one backend image started with two commands, and the web app is deployed on its own.
  The documentation site is static files. The migration job runs once per release, before the new version takes traffic.
- **Shared Libraries**: bundled with consuming applications (`libs/client_sdk`).
- **State**: PostgreSQL 18 or newer and Redis, both required. Redis is not disposable: it holds queued jobs and sign-out marks.
- **Status**: the repository defines a local stack, an emulated AWS stack for testing and Kubernetes templates, but no production
  infrastructure, working CI/CD pipeline or web image yet. What exists, what is missing and what needs a decision are on
  [Infrastructure](../infrastructure/overview.md) and [Open items](../infrastructure/open-items.md). What each service does is on
  [Services](../services/overview.md).

## Quality Assurance

### Code Quality

- TypeScript for type safety
- ESLint for code consistency
- Prettier for formatting
- Pre-commit hooks for validation

### Testing Strategy

- Unit tests for individual components/functions
- Integration tests for application workflows
- E2E tests with Playwright
- Documentation testing for accuracy

## Scalability Considerations

### Running at scale

The API and web app are stateless and scale by adding replicas. The worker scales for availability rather than speed, because Google's
quota limits review sync. Database connections are the first hard limit: connections needed are (API replicas + worker replicas)
x `DB_POOL_MAX`. See [Capacity and scaling](../infrastructure/capacity-and-scaling.md).

### Adding New Applications

1. Create new directory under `apps/`
2. Add to pnpm workspace configuration
3. Follow established patterns and conventions
4. Create comprehensive documentation

### Shared Code Management

1. Place reusable code in `libs/`
2. Maintain clear API boundaries
3. Version shared dependencies carefully
4. Document breaking changes

---

*This architecture evolves with the project. Keep this document updated as the system grows.*