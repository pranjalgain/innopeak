# Claude CLI Instructions

## Project Overview

This is a **Monorepo** containing multiple applications and shared libraries managed with **pnpm** workspaces.

## Directory Structure

```
/
├── apps/
│   └── documentation/    # Docusaurus documentation site
│       └── docs/         # Developer & Product documentation
├── libs/                 # For shared libraries and utilities
├── package.json          # Root package.json (use pnpm only)
├── pnpm-lock.yaml        # pnpm lock file
├── tsconfig.base.json    # Shared TypeScript configuration
├── .prettierrc           # Code formatting rules
├── .prettierignore       # Prettier ignore patterns
├── eslint.config.js      # Linting configuration
├── playwright.config.js  # E2E testing configuration
├── .editorconfig         # Editor settings
├── .gitignore            # Git ignore patterns
└── .vscode/              # VS Code workspace settings
```

## Development Guidelines

- **Package Management:** Use `pnpm` for all package management.
- **Port Conflict Resolution:** When multiple applications need to run simultaneously, follow these guidelines:
  - **Check Active Ports:** Use `lsof -i :PORT` or `netstat -tulpn | grep PORT` to identify conflicts
  - **Default Port Assignments:**
    - Backend (NestJS): Usually :3000 or :8000
    - Web (Next.js): Usually :3001 or :3000
    - Mobile (Expo): Usually :19000, :19001, :19002
    - Documentation: Usually :3002 or :8080
  - **Resolution Steps:**
    - Stop conflicting processes: `kill -9 PID` or `pkill -f process_name`
    - If PORT is used via environment variable then we can set alternative ports: `PORT={NEW_PORT} pnpm dev` otherwise we can try using `pnpm dev -p {NEW_PORT}`.
    - Update app-specific `.env` files with non-conflicting ports
    - Check Docker containers if using containerized services: `docker ps`
  - **Prevention:** Always check `apps/{APP_NAME}/README.md` for recommended port configurations.
- **Application-Specific Rules:** Each application has its own AI/development rules defined in `/apps/{APP_NAME}/AGENT.md`. These files contain markup language instructions for that specific app.
- **Documentation Standards:**
  - **Location**: `apps/documentation/docs/{APP-NAME}/`
  - **Format**: Markdown (`.md`) files
  - **Scope**: Document each significant activity, feature, or architectural change
  - **Updates**: Keep documentation current with code changes
  - **Requirement**: **ALWAYS** create comprehensive documentation in `apps/documentation/docs/` before implementing any significant feature or architectural change
- **Database Development Standards:**
  - **SQL-First Approach**: Always write raw SQL migration files first, then regenerate the Drizzle schema from the database. Never use Drizzle Kit to generate migrations.
  - **Migration Files**: Create detailed SQL migrations with proper indexes, constraints, and relationships, under `src/db/drizzle/migrations/`
  - **One Migration File Per Module**: Maintain one consolidated migration file per functional module (e.g., `auth_module.sql`, `user_management.sql`). Update the same file with all migrations required for that module rather than creating multiple separate files
  - **Schema Generation**: Use `pnpm db:introspect` to regenerate the Drizzle schema (`src/db/drizzle/schema.ts`) after applying SQL migrations
  - **Workflow**: SQL Migration → Update `meta/_journal.json` → Apply to DB (`pnpm db:migrate`) → Regenerate Drizzle Schema (`pnpm db:introspect`) → Implement Code
- **Getting Started:** Refer to individual app README files for setup instructions, Located at `apps/{APP_NAME}/README.md`. These contain:
  - How to start/stop the application
  - Access URLs and credentials
  - Development setup requirements
  - Testing procedures
  - AI debugging steps
- **Module Development Workflow:**
  1. **Documentation First**: Create comprehensive documentation in `apps/documentation/docs/backend/{module-name}/` before any implementation
  2. **User Confirmation**: Get explicit approval from user before proceeding with implementation

## Claude CLI Context Management

### Context Updates Required

Always update this `claude.md` file when:

- Architecture changes occur
- New applications or libraries are added
- Development workflows change
- Directory structure modifications
- Configuration updates

### Best Practices

1. **Read First**: Always check `apps/{APP_NAME}/README.md` before working on an app.
2. **Follow Rules**: Respect the `.cursorrules` for each application.
3. **Document Changes**: Update relevant documentation in `apps/documentation/docs/`.
4. **Maintain Context**: Keep this file (current - `claude.md`) with any modifications.

## Error Handling & Troubleshooting Guidelines

### **CRITICAL: Proactive Error Resolution**

Claude should **ALWAYS** attempt to fix errors and try solutions automatically before reporting issues to the user. This includes:

1. **Analyze Error Messages**: Parse logs and error output to identify root causes
2. **Apply Known Fixes**: Implement standard solutions for common issues
3. **Retry Operations**: After applying fixes, retry the failed operation
4. **Track Progress**: Use TodoWrite tool to track fix attempts and progress
5. **Update Context**: Document successful fixes in this file for future reference

### Error Detection Process

1. **Monitor Background Processes**: Regular checking of bash output for errors
2. **Parse Error Types**: Categorize errors (memory, dependency, configuration, etc.)
3. **Apply Fix Patterns**: Use established fix patterns based on error type
4. **Validate Solutions**: Confirm fixes work before proceeding
5. **Document New Patterns**: Add new successful fixes to this context

### Success Criteria

- ✅ Errors are automatically detected and resolved
- ✅ Users see working applications, not error messages
- ✅ Troubleshooting context is maintained for future issues
- ✅ Development workflow remains smooth and efficient

---

*This file serves as the primary context for Claude CLI operations. Keep it updated with any architectural or workflow changes.*
