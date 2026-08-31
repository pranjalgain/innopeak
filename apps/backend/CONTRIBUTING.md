# Contributing

## Development Policy

This project follows a **document-first** workflow for behavior changes.

If your PR changes behavior, you must update documentation before or with code:

- `docs/` (preferred for feature/module workflow)
- `README.md` (for setup/usage changes)
- `AGENTS.md` (for AI workflow policy changes)

## When Documentation Is Required

Documentation updates are required for:

- New feature flows
- API contract changes
- Auth/permission changes
- DB schema/migration/repository changes
- Queue/background behavior changes
- New env vars or operational behavior

## Pull Request Requirements

- Link the docs section that defines the flow
- Explain what changed and why
- Include verification steps and test results

PRs that change behavior without related documentation may be blocked by CI.

