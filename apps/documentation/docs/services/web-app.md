---
sidebar_position: 4
---

# Web App

The web app is what people open in a browser. It contains three things: the **business console**
where owners and team members work through reviews and settings, the **admin console** for platform
administrators, and the public **sign-in and onboarding** screens. It is a Next.js 16 application in
`apps/web`, available in English and German.

## Screens

| Area | Routes | Who |
|---|---|---|
| Sign-in and sign-up | `/login`, `/onboarding/signup`, `/onboarding/business-name` | Anyone |
| Onboarding | `/onboarding/plan`, `/onboarding/connect` | A new business owner: choose a plan, connect Google |
| Business console | `/dashboard`, `/review-queue`, `/review-queue/[id]`, `/settings`, `/settings/prompts` | Owners and members of a business |
| Admin sign-in | `/admin-login` | Platform admins. It is deliberately not under `/admin`, because it must be public |
| Admin console | `/admin`, `/admin/businesses`, `/admin/users`, `/admin/billing`, `/admin/activity`, `/admin/settings` | Platform admins |
| Error pages | `/forbidden`, `/unauthorized` | Anyone who hits the wrong console for their account |

Paths are defined in `apps/web/src/app/_libs/constants/routes.ts`. The settings screen has these tabs
(`apps/web/src/app/(dashboard)/settings/_components/settings-view.tsx`): General, Profile, Members,
Blocklist, Notifications, Connection, AI and Billing. Some are conditional, and members only ever see
Profile. [Business settings](./business-settings.md) lists what each one changes.

## How it talks to the API

Every call to `/v1/...` goes to the web app's own address, and `next.config.ts` forwards it to the
API. The browser therefore treats the API's sign-in cookies as first-party, even when the API runs on
another host. The proxy allows 120 seconds, because the live notification stream stays open and idles
for up to 25 seconds between heartbeats.

:::warning API_URL is fixed when the app is built
The forward address comes from `API_URL` and is evaluated by `next build`, then written into
`.next/routes-manifest.json`. Changing `API_URL` on a running container has no effect: build the
image with the target environment's API address, or rebuild when it changes. One image cannot be
promoted unchanged from staging to production unless both use the same API address.
:::

## What the edge proxy does

`apps/web/src/proxy.ts` runs before every page. It reads the non-secret `session` cookie
(`tenant` or `admin`) that the API sets at sign-in, and:

- sends a signed-in visitor from `/login` or the home page to their own home, honouring a safe `?next=`
  address;
- sends a visitor without a session who asks for a console page to the matching sign-in screen,
  remembering where they were going;
- sends a business user who asks for an admin page, or the reverse, to `/forbidden`;
- gives every page response a Content-Security-Policy with a fresh nonce, so only scripts the server
  stamped can run.

This is a convenience that avoids a flash of the wrong page. It is not a security boundary: the cookie
carries no credential, the console pages check the session again, and the API authorises every call.

Fixed security headers (frame protection, MIME sniffing, referrer, permissions and HSTS) are set in
`next.config.ts`.

## Operating it

| Item | Detail |
|---|---|
| Build and start | `next build`, then `next start` (development runs on port 3002) |
| Health | `GET /api/health` returns `{"status":"ok", ...}` with the uptime. It checks nothing else, so it is a liveness check, not a readiness check |
| Error reporting | Sentry, enabled by `NEXT_PUBLIC_SENTRY_DSN`. Uploading source maps during the build also needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` together. The backend has no Sentry |
| Container | There is no Dockerfile for the web app yet, and `next.config.ts` does not set `output: 'standalone'`. See [Compute and containers](../infrastructure/compute-and-containers.md) |
| Languages | English and German. Every user-facing string needs both (`apps/web/messages/en.json` and `de.json`) |

Environment variables (`apps/web/env.ts`) are listed in the
[Configuration reference](./configuration-reference.md#web-app).
