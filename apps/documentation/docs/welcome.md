---
sidebar_position: 1
---

# Welcome to InnoPeak

InnoPeak helps a business keep up with its Google reviews. It reads each new review from the
business's Google Business Profile, decides whether it needs a person, drafts replies with AI, holds
them for the owner's approval (automatic posting is off by default), and posts the approved reply back to Google. Risky reviews are escalated
to a responsible person instead of getting an automatic answer.

This site documents how it is built, what is deployed, how it is configured, and what is needed to run
it.

## Start here

| If you want to know | Read |
|---|---|
| What is deployed, and what each service does | [Services](./services/overview.md) |
| Every setting: environment variables, platform switches, business settings, roles | [Configuration reference](./services/configuration-reference.md), [Platform settings](./services/platform-settings.md), [Business settings](./services/business-settings.md), [Roles and permissions](./services/roles-and-permissions.md) |
| What infrastructure it needs, how big, and what is still missing | [Infrastructure](./infrastructure/overview.md) and [Open items](./infrastructure/open-items.md) |
| How to run it in production | [Operations](./backend/operations.md), [Deployment and releases](./infrastructure/deployment-and-releases.md) |

## For developers

- **[Backend](./backend/overview.md):** the NestJS API and background worker, with a page per module
  and its API reference.
- **[Frontend](./frontend/overview.md):** the Next.js business and admin consoles.
- **[Shared libraries](./shared/overview.md):** the generated API client.
- **[Architecture](./meta/architecture.md):** how the pieces fit together.
- **[Contributing](./meta/contributing.md)** and the **[style guide](./meta/style-guide.md)**.

Run the documentation locally with `pnpm docs:dev` from the repository root.
