# AGENTS.md

## Goal

This repository is optimized for AI-assisted development. The primary rule is **document first, code second** for any behavior-changing work.

## Mandatory Flow

1. Create or update documentation in `docs/` (or `README.md`) for the requested behavior.
2. Confirm scope, acceptance criteria, and API/data/test impact in docs.
3. Only then implement code changes.
4. Update tests and run relevant verification commands.

## Doc-First Required Changes

Doc updates are required before code for:

- New endpoints, DTOs, request/response contracts, auth changes
- Schema, migration, repository, or persistence workflow changes
- New module/provider/queue/background job behavior
- New third-party integration or environment variable contract
- Changes to developer workflow, scripts, or runtime architecture

## Doc-Light Allowed

No full RFC required for:

- Typos/comments
- Pure formatting or lint-only changes
- Internal refactors with no external behavior change

Even in these cases, update docs if behavior or workflow changed.

## AI Agent Policy

- If a request introduces new behavior and no matching documentation exists, **create docs first**.
- Do not write implementation code before documenting the flow.
- Link code changes back to the relevant docs section in the final summary.

