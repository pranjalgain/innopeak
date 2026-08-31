# Cursor Rules Guide

This guide explains how to use the Cursor Rules implemented for this Next.js 15 boilerplate project.

## 📁 Rule Organization

The rules are organized into five main categories:

### 1. Always-Applied Rules (3 files)

These rules are automatically applied to all relevant files and provide foundational guidance:

- **`nextjs-app-router.mdc`** - Next.js 15 App Router patterns, file organization, and routing conventions
- **`typescript-strict.mdc`** - Strict TypeScript patterns, type safety, and no-any enforcement
- **`project-conventions.mdc`** - Project-wide conventions including naming, path aliases, and file colocation

### 2. Frontend Auto-Attached Rules (8 files)

These rules automatically attach when working with frontend code based on file patterns:

- **`ui-components.mdc`** - CVA patterns, Radix UI integration, and polymorphic components
- **`tailwind-styling.mdc`** - Tailwind CSS v4 patterns, dark mode, and responsive design
- **`accessibility.mdc`** - A11y patterns, ARIA attributes, and focus management
- **`nextjs-config.mdc`** - Metadata, viewport, fonts, and SEO configuration
- **`env-management.mdc`** - Type-safe environment variables with @t3-oss/env-nextjs
- **`custom-hooks.mdc`** - React hooks patterns, mobile detection, and state management

### 3. Feature-Specific Auto-Attached Rules (5 files)

These rules attach when working with specific features or file types:

- **`error-boundaries.mdc`** - Client-side error handling and Sentry integration
- **`utilities.mdc`** - Helper functions, cn utility, and class merging patterns
- **`component-testing.mdc`** - Vitest component testing patterns and best practices
- **`e2e-testing.mdc`** - Playwright E2E testing patterns and page object models

### 4. Manual/Agent-Requested Rules (4 files)

These rules are available on-demand when requested or when working on specific tasks:

- **`form-patterns.mdc`** - React Hook Form with Zod validation, multi-step forms, and advanced patterns

### 5. Minimal Backend Rules (2 files)

Essential rules for backend/API development:

- **`api-routes.mdc`** - Next.js 15 App Router API routes, middleware, and server-side logic

## 🎯 How Rules Are Applied

### Automatic Application

1. **Always-Applied Rules**: Active for all TypeScript/JavaScript files
2. **Auto-Attached Rules**: Applied based on file paths and names using glob patterns
3. **Context-Sensitive**: Rules activate when editing relevant file types

### Manual Activation

You can explicitly request specific rules by:

1. **Using @ mentions**: Type `@custom-hooks` to activate custom hooks guidance.
2. **Asking directly**: Example "Show me form patterns".

### Glob Pattern Examples

Rules automatically activate based on these patterns:

```
UI Components: **/components/ui/**
Forms: **/*form*, **/*Form*
Testing: **/__tests__/**, **/*.test.*, **/*.spec.*
API Routes: **/api/**, **/route.ts
```
