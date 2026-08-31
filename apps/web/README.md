# Next.js Boilerplate — Create Next CoE

A production-ready Next.js boilerplate focused on performance, observability, analytics, type‑safety, and modern UI components, without vendor lock‑in. We've done the heavy lifting so you can ship faster. 🌍

**Repository:** [GeekyAnts GitLab](https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs) — authentication is required.

## 📋 Table of Contents

### 🚀 Getting Started

- [🆕 New to These Tools?](#-new-to-these-tools)
- [🚀 Quick Start](#-quick-start-2-minutes)
- [📃 Available Scripts](#-available-scripts)
- [🗄️ Database Setup](#-database-setup)
- [🧪 Testing](#-testing)
- [🚀 Deployment](#-deployment)

### 📊 Architecture & Advanced

- [📊 Architecture Overview](#-architecture-overview)
- [📡 Observability & Analytics](#-observability--analytics)
- [📕 OpenAPI Documentation](#-openapi-documentation)
- [🎨 Styling & UI Components](#-styling--ui-components)

### 📖 Reference

- [💻 Environment Variables](#-environment-variables)
- [📏 Development Guidelines](#-development-guidelines)
- [❓ Frequently Asked Questions](#-frequently-asked-questions)
- [🔎 Useful Routes](#-useful-routes)

### 📚 Additional Guides

- [🆕 Beginner's Guide](./BEGINNER_GUIDE.md) - New to these tools? Start here!
- [🧪 Testing Guide](./TESTING.md) - Comprehensive testing documentation

---

## 🚀 Quick Start (2 minutes)

```bash
# 1. Clone and install
git clone https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs.git
cd nextjs

# Install dependencies
corepack enable
pnpm install

# 2. Set up environment (automated)
pnpm setup

# 3. Start developing
pnpm dev
```

That's it! Open `http://localhost:3000` and start building. 🎉

**Prerequisites:**

- [Node.js](https://nodejs.org/) ≥ 24
- [pnpm](https://pnpm.io/) ≥ 11 (managed through Corepack)

---

## 📚 What's Included

With this template, you get the following out of the box:

### 🏗️ **Core Framework**

- 🏎️ **[Next.js 16](https://nextjs.org/)**: App Router, React 19, typed routes, Turbopack development
- 💅 **[Tailwind CSS v4](https://tailwindcss.com/)**: Utility‑first styling with prebuilt UI primitives
- ✨ **[ESLint](https://eslint.org/)** and **[Prettier](https://prettier.io/)**: Clean, consistent code
- 🛡️ **Type‑safe env with [@t3‑oss/env‑nextjs](https://env.t3.gg/)**: Build‑time validation via Zod

### 📊 **Analytics & Monitoring**

- 📈 **Analytics-ready**: [PostHog](https://posthog.com), [Vercel Analytics](https://vercel.com/analytics), [Speed Insights](https://vercel.com/docs/speed-insights), and a [GTM](https://tagmanager.google.com) proxy
- 🧪 **Feature flags & experiments**: PostHog-ready homepage demo with a clear fallback until configured
- 🛡️ **Error tracking-ready**: [Sentry](https://sentry.io) integration points for client, server, and edge runtimes

### 🛠️ **Developer Experience**

- 🔎 **OpenAPI Reference**: Generated docs (via `openapi-gen` / `next-openapi-gen`) rendered with Scalar at `/reference`
- 🧪 **Complete Testing Suite**: Unit, Integration, and E2E testing with Vitest and Playwright
- 🔐 **SEO**: OpenGraph, Twitter cards, sitemap, robots, JSON‑LD
- 🎨 **Showcase UI**: Responsive `/showcase`, shared navigation, branded error states, and light/dark themes
- 🧩 **UI Primitives**: 46 shadcn/Radix components with semantic Tailwind CSS tokens
- 🚀 **Performance tooling**: Bundle analyzer (`pnpm analyze`), optimized package imports
- 📦 **Absolute imports & path aliases**: `@/*`, `@/components/*`, `@/app/*`, etc.
- 🪝 **Husky pre‑commit**: Typecheck, circular‑dep check, lint, build

---

## 🆕 New to These Tools?

**Don't worry!** This template uses many modern tools that might seem overwhelming at first.

📖 **[Read our Beginner's Guide](./BEGINNER_GUIDE.md)** for simple explanations of everything, learning paths, and tips to get started.

**TL;DR:** You can start building right away with the Quick Start below - you don't need to understand everything immediately!

---

## 📃 Available Scripts

**Package Manager Note:** The project is standardized on pnpm. The `dev` workflow invokes pnpm directly to generate OpenAPI before starting Next.js.

### Development

- `setup`: 🆕 **Automated environment setup** (recommended for first-time setup)
- `dev`: Generate the OpenAPI specification and start Next.js with Turbopack
- `build`: Build the app for production
- `analyze`: Build with bundle analysis enabled
- `start`: Start the production server

### Code Quality

- `lint`: Lint `src` with ESLint
- `lint:fix`: Fix lint issues
- `format`: Format all files with Prettier
- `type:generate`: Generate typed routes (`next typegen`)
- `type:check`: Typecheck with `tsc --noEmit`
- `type:circular`: Detect circular dependencies with Madge

### Testing

**Unit & Integration Tests (Vitest):**

- `test:run`: Run all unit and integration tests
- `test:unit`: Run unit tests only (utility functions)
- `test:integration`: Run integration tests only (API endpoints)
- `test:ui`: Interactive Vitest UI mode
- `test:coverage`: Generate test coverage report

**E2E Tests (Playwright):**

- `test:e2e`: Run all E2E tests across browsers
- `test:e2e:headed`: Run tests in headed mode (visible browser)
- `test:e2e:ui`: Interactive Playwright UI mode
- `test:e2e:report`: View HTML test report
- `test:e2e:install`: Install Playwright browsers

### Database

- `db:generate`: Generate migrations from schema
- `db:migrate`: Apply migrations
- `db:*:studio`: Open Drizzle Studio for database exploration

**Pro tips:**

- Run `pnpm analyze` to enable the Next.js bundle analyzer
- Path aliases are configured in `tsconfig.json` (`@/*`, `@/components/*`, etc.)

---

## 🗄️ Database Setup

Drizzle ORM is configured with `drizzle-kit` for migrations and `src/db/client.ts` for runtime access. You can switch between Postgres, MySQL, and SQLite.

- **Schemas**: `src/db/schema/postgres.ts`, `src/db/schema/mysql.ts`, `src/db/schema/sqlite.ts`
- **Migrations output**: `src/db/drizzle/<dialect>`
- **Config**: `drizzle.config.ts` uses `DB_DIALECT` and `DATABASE_URL`
- **Runtime client**: `src/db/client.ts` auto‑selects the driver based on `DB_DIALECT`

### Database Options

- **SQLite** (default): Zero setup, perfect for development
- **PostgreSQL**: Run `pnpm docker:up` for a local instance
- **MySQL**: Run `pnpm docker:up` for a local instance

### Setup Steps

1. **Start a local database** (optional, for Postgres/MySQL)

   ```bash
   pnpm docker:up        # starts postgres, mysql, redis

   pnpm docker:logs      # follow logs (optional)
   pnpm docker:down      # stop services
   ```

2. **Set environment variables** (add to `.env`)

   ```bash
   # SQLite (default)
   DB_DIALECT=sqlite
   DATABASE_URL=./create-next-coe.db

   # PostgreSQL
   DB_DIALECT=postgresql
   DATABASE_URL=postgres://user:password@localhost:5432/dbname

   # MySQL
   DB_DIALECT=mysql
   DATABASE_URL=mysql://user:password@localhost:3306/dbname
   ```

3. **Generate and run migrations**

   ```bash
   pnpm db:generate   # generate SQL migrations from schema
   pnpm db:migrate    # apply migrations
   ```

4. **Explore with Drizzle Studio**
   ```bash
   pnpm db:sqlite:studio    # for SQLite
   pnpm db:pg:studio        # for PostgreSQL
   pnpm db:mysql:studio     # for MySQL
   ```

---

## 🧪 Testing

This project includes a **complete 3-layer testing strategy** with Unit, Integration, and E2E testing - providing enterprise-grade quality assurance.

### Quick Start

```bash
# Run all tests (unit + integration)
pnpm test:run

# Run unit tests only
pnpm test:unit

# Run integration tests only
pnpm test:integration

# Run E2E tests (browser testing)
pnpm test:e2e

# Interactive testing modes
pnpm test:ui              # Vitest UI mode
pnpm test:e2e:ui         # Playwright UI mode
```

### Complete Test Structure

```
src/
├── app/_libs/utils/
│   └── math.test.ts           # Unit tests (8 tests)
└── test/
    ├── setup.ts               # Global test configuration
    └── integration/
        └── api-routes.integration.test.ts  # API integration tests (9 tests)
tests/e2e/                     # 24 scenarios across 5 browser projects
    ├── homepage.spec.ts        # Homepage functionality
    ├── api.spec.ts             # API routes testing
    ├── navigation.spec.ts      # Navigation & routing
    ├── performance.spec.ts     # Performance & Web Vitals
    └── utils.ts               # Test utilities
```

### 🎯 Testing Pyramid

**🔧 Unit Tests (8 tests):** Individual functions and utilities

- Math operations, utility functions
- Fast execution, isolated testing

**📊 Integration Tests (9 tests):** API endpoints and service integration

- API route functionality (`/api/health`, `/api/simple-users`, `/api/users`)
- Data validation and error handling
- Service layer integration

**🌐 E2E Tests (24 scenarios):** Full user workflows across five browser projects

- Multi-browser testing (Chrome, Firefox, Safari, Mobile)
- Performance monitoring and Web Vitals
- Responsive layout and navigation coverage

### Live Testing Demo

Visit **`/users`** to see a live example of the integration testing patterns in action with hardcoded user data.

### Test Coverage & Quality

**✅ All Tests Passing:** 17/17 unit + integration tests  
**✅ Cross-Browser E2E:** 24 scenarios configured across 5 browser projects  
**✅ Type Safety:** Strict TypeScript with no `any` types  
**✅ Performance:** Web Vitals monitoring included  
**✅ CI/CD Ready:** GitHub and GitLab quality-gate templates included

📖 **Want to learn more?** Check out our comprehensive [Testing Guide](./TESTING.md) for detailed information about our testing philosophy, advanced features, and best practices.

---

## 🚀 Deployment

The source is hosted in the private [GeekyAnts GitLab repository](https://git.geekyants.com/geekyants/coe-grp/boilerplates/frontend/nextjs). Authenticate with your GeekyAnts account before cloning or configuring deployment.

Run `pnpm build` to validate the production bundle, then connect the repository to your approved hosting platform and provide the variables documented in `.env.example`.

---

## 📊 Architecture Overview

The following sequence diagram reflects the default demo flow. Analytics, feature flags, Sentry, and database-backed services are integration-ready and activate only when configured.

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Browser as 🌐 Browser
    participant App as ⚡ Next.js App Router
    participant API as 🔌 API Routes
    participant Service as 🧪 Demo Service
    participant DB as 🗄️ Optional Drizzle DB
    participant Telemetry as 📊 Optional Telemetry

    Note over User, Telemetry: Application render
    User->>Browser: Navigate to page
    Browser->>App: Request route
    App-->>Browser: Server-rendered UI
    opt Analytics keys configured
        Browser->>Telemetry: Page views and Web Vitals
        Telemetry-->>Browser: Feature flag variants
    end

    Note over User, Telemetry: API demo flow
    User->>Browser: API call
    Browser->>API: HTTP Request to /api/*
    API->>API: Validate input with Zod where declared
    API->>Service: Execute demo operation
    Service-->>API: In-memory result
    opt Replace demo service with a configured database
        API->>DB: Drizzle query
        DB-->>API: Typed result
    end
    API-->>Browser: JSON response
    opt Sentry configured
        API->>Telemetry: Capture exceptions and traces
    end

    Note over User, Telemetry: OpenAPI documentation
    User->>Browser: Visit /reference
    Browser->>App: Request Scalar reference
    App->>App: Load generated openapi.json
    App-->>Browser: Interactive API documentation
```

### Key Flow Highlights:

- **🔒 Type-Safe Environment**: Runtime configuration validated with Zod
- **📊 Optional Telemetry**: PostHog, Sentry, GTM, and Vercel integrations are ready for credentials
- **🎯 Feature Flags**: PostHog flag demo includes a safe unconfigured fallback
- **🚨 Error Handling**: Branded boundaries with optional client, server, and edge reporting
- **🔌 API Documentation**: Auto-generated OpenAPI docs with Scalar UI
- **🗄️ Multi-Database**: Drizzle scaffolding for SQLite, PostgreSQL, and MySQL

---

## 📡 Observability & Analytics

- **PostHog**: Optional analytics, session replays, heatmaps, and feature flags.
  - Proxied via Next rewrites to `/ingest` to reduce ad‑blocker impact.
  - Client and server hooks activate when the required keys are configured.
- **Sentry**: Optional error tracking for client, server, and edge.
  - Production source-map upload requires `SENTRY_AUTH_TOKEN`; events can use the `/monitoring` tunnel.
- **Vercel Analytics** and **Speed Insights** are wired in.
- **Google Tag Manager**: Rendered only when `NEXT_PUBLIC_GTM_KEY` is set, with proxied endpoints such as `/gm`.

---

## 📕 OpenAPI Documentation

- Author API routes under `src/app/api` and keep your OpenAPI schema updated.
- The UI at `/reference` renders `public/openapi.json` with Scalar.
- During dev, `pnpm dev` runs `pnpm openapi:generate` before starting the dev server.

---

## 🎨 Styling & UI Components

- **Tailwind CSS v4** for styling.
- **46 shadcn/Radix primitives** live in `src/components/ui` (buttons, dialogs, tables, sheets, charts, forms, and more).
- The public layout includes shared navigation, footer, responsive showcase sections, and a persistent light/dark theme toggle.
- Interactive links and enabled buttons consistently use pointer cursors; disabled controls retain a not-allowed cursor.

---

## 💻 Environment Variables

### 🚀 Quick Setup (Most Common)

For development, you only need these essential variables:

```bash
# Basic app info (required)
NEXT_PUBLIC_APP_TITLE="Your App Name"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Database (SQLite is simplest for dev)
DB_DIALECT="sqlite"
DATABASE_URL="./your-app.db"
```

### 📊 With Analytics (Optional)

Add these if you want analytics and error tracking:

```bash
# PostHog (analytics & feature flags)
NEXT_PUBLIC_POSTHOG_KEY="your-posthog-key"

# Sentry (error tracking)
SENTRY_AUTH_TOKEN="your-sentry-token"

# Google Tag Manager (optional)
NEXT_PUBLIC_GTM_KEY="your-gtm-id"
```

### 🗄️ Database Options

Choose one database setup:

```bash
# Option 1: SQLite (easiest for development)
DB_DIALECT="sqlite"
DATABASE_URL="./create-next-coe.db"

# Option 2: PostgreSQL
DB_DIALECT="postgresql"
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Option 3: MySQL
DB_DIALECT="mysql"
DATABASE_URL="mysql://user:password@localhost:3306/dbname"
```

### 📋 Complete Reference

<details>
<summary>Click to see all available environment variables</summary>

```bash
# Development
NODE_ENV="development"
ANALYZE="false"

# App Configuration
NEXT_PUBLIC_APP_ENV="development"
NEXT_PUBLIC_APP_TITLE="Your App Title"
NEXT_PUBLIC_APP_NAME="Your App Name"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_DESCRIPTION="Your app description"
NEXT_PUBLIC_APP_CATEGORY="Your category"
NEXT_PUBLIC_APP_KEYWORDS="your,keywords,here"

# Analytics (all optional for development)
NEXT_PUBLIC_GTM_KEY=""
POSTHOG_API_KEY=""
POSTHOG_ENV_ID=""
NEXT_PUBLIC_POSTHOG_KEY=""
NEXT_PUBLIC_POSTHOG_HOST="https://eu.i.posthog.com"
NEXT_PUBLIC_POSTHOG_INGEST="/ingest"
NEXT_PUBLIC_POSTHOG_ENVIRONMENT="development"
SENTRY_AUTH_TOKEN=""

# Database
DB_DIALECT="sqlite"
DATABASE_URL="./create-next-coe.db"
```

</details>

**💡 Pro Tip:** Use `pnpm setup` to automatically configure your environment!

---

## 📏 Development Guidelines

### Conventions

- **File and folder names must be kebab-case**. Do not use PascalCase, camelCase, or snake_case.
- **Co-locate by usage hierarchy**: place folders and libraries within the app areas they serve. Follow Next.js colocation with `_private` folders as needed (see the [Next.js colocation docs](https://nextjs.org/docs/app/getting-started/project-structure#colocation)).

### Package Management

- **Stick to the versions specified in this boilerplate** - they are tested and work together
- **Do not update packages individually** without testing the entire application
- **If you encounter version conflicts** with your existing packages, reach out to [ruchika@geekyants.com](mailto:ruchika@geekyants.com) for guidance

### Code Quality

- Detect circular dependencies: `pnpm type:circular`
- All code is automatically formatted with Prettier
- ESLint catches common issues and enforces best practices
- Husky runs pre-commit checks (typecheck, lint, circular dependency check)

### Guidelines

- **Read this README** to understand the setup and conventions
- **Remove unneeded pieces** based on your project requirements
- **Test thoroughly** after making any changes to dependencies

### Maintenance Note

- **Dependencies will be updated every 15 days** by the maintainers

---

## ❓ Frequently Asked Questions

### **Q: I'm getting package version conflicts when adding new dependencies**

**A:** This boilerplate uses carefully tested package versions that work together. If you need to add a package that conflicts with existing versions:

1. **Don't update existing packages** - this can break the carefully balanced dependencies
2. **Try using the conflicting package's compatible version** that works with our setup
3. **If you must update core packages**, reach out to [ruchika@geekyants.com](mailto:ruchika@geekyants.com) for guidance
4. **Test thoroughly** - run `pnpm build`, `pnpm lint`, and `pnpm type:check` after any changes

### **Q: Can I update Next.js or React to the latest version?**

**A:** Please don't update major dependencies without consultation. This boilerplate is tested with specific versions. Contact [ruchika@geekyants.com](mailto:ruchika@geekyants.com) if you need newer versions.

### **Q: My IDE shows TypeScript errors after adding a new package**

**A:** This usually indicates version conflicts. Check if the new package requires different versions of `@types/*` packages. Stick to the versions in our `package.json` or contact [ruchika@geekyants.com](mailto:ruchika@geekyants.com).

### **Q: Which package manager should I use?**

**A:** Use **pnpm**. The development script invokes pnpm directly for OpenAPI generation, and the lockfile/workspace configuration is pnpm-based.

### **Q: How do I know if my changes broke something?**

**A:** Run these commands after any dependency changes:

```bash
pnpm build && pnpm lint && pnpm type:check
```

### **Q: Something is missing that's common to all projects?**

**A:** This boilerplate is continuously improved based on real project needs. If you find something missing that would benefit all projects, please reach out to [ruchika@geekyants.com](mailto:ruchika@geekyants.com) with:

- **What's missing**: Describe the feature/tool/pattern needed
- **Why it's needed**: Explain the use case and benefits
- **How common it is**: Is this needed across multiple projects?
- **Suggested implementation**: If you have ideas on how to add it

Your feedback helps make this boilerplate better for everyone! 🚀

---

## 🔎 Useful Routes

### Core Pages

- **Marketing page**: `/` (rewritten internally to `/home`)
- **Complete showcase**: `/showcase` - Comprehensive overview of the current boilerplate features
- **Integration testing demo**: `/users` - Live example with hardcoded user data
- **API Reference (Scalar)**: `/reference` (reads from `/openapi.json`)
- **Observability demo**: `/sentry-example-page` - Intentional Sentry client/API error test

### API Endpoints

- **Health check**: `/api/health` - System status and uptime
- **Simple users**: `/api/simple-users` - Returns 2 hardcoded users (for testing)
- **User management demo**: `/api/users` - In-memory list, create, and reset operations with validation
- **Example OpenAPI route**: `/api/openapi/[id]`
- **Sentry example API**: `/api/sentry-example-api`

### System Routes

- **Sitemap**: `/sitemap.xml`
- **Robots**: `/robots.txt`
- **Auth-state templates**: `/unauthorized`, `/forbidden` (UI states only; authentication is not included)
