---
sidebar_position: 9
---

# Roles and Permissions

There are two kinds of account, and they never mix. **Business users** belong to one business and are
either an owner or a member. **Platform admins** belong to no business and run the installation. Each
kind signs in separately, with its own cookie, and a token of one kind is refused on the other's
routes.

## Who can do what

| Capability | Business owner | Business member | Platform admin |
|---|---|---|---|
| View the dashboard, reviews and their drafts | Yes | Yes | No |
| Approve, reject, edit, post, retry or write a reply | Yes | Yes | No |
| See the notification bell, connection state and locations | Yes | Yes | No |
| Change their own profile, picture, password and language | Yes | Yes | Yes (admin profile) |
| Change business settings: threshold, retention, AI reply count | Yes | No | No |
| Manage the blocklist, notification recipients and prompts | Yes | No | No |
| Invite, remove and cancel the removal of members | Yes | No | No |
| Connect or disconnect Google, choose locations, switch the active location | Yes | No | No |
| Billing: plan, payment method, profile and receipts | Yes | No | No |
| Export data, delete or restore the business | Yes | No | No |
| See and act on every business and user (suspend, reactivate, request or cancel erasure) | No | No | Yes |
| See the overview, statistics, billing views and activity log | No | No | Yes |
| Change platform settings | No | No | Yes |
| Invite, enable and disable platform admins | No | No | Yes |
| Open the queue dashboard (`/admin/queues`) | No | No | Yes |

In the web app a member sees only the Profile tab in Settings, and a read-only view of the active
location.

## How the API decides

Three global guards run on every request, in this order: the rate limiter, the sign-in check, then the
role check (`apps/backend/src/api/auth/guards/roles.guard.ts`).

| Route is marked | Who gets through |
|---|---|
| `@Public()` | Everyone, with no sign-in. Sign-up, sign-in, the platform configuration, health, and the Stripe webhook (which proves itself with a signature) |
| nothing | **Any business user.** A platform admin is refused, so a route that forgot its role check cannot be reached by an admin token |
| `@Roles(UserRole.OWNER)` | Owners only |
| `@Roles(JwtTokenType.PLATFORM_ADMIN)` | Platform admins only |

A test (`route-guards.spec.ts`) reads the markings off every controller and fails if a route under
`admin/` is missing the platform-admin role. Every business route also filters its database queries by
the signed-in user's business, so an id from another business simply finds nothing.

## Platform admins

Admins sign in at `/admin-login` with a password, Google or Microsoft (Microsoft is pinned to one
directory, see [Configuration reference](./configuration-reference.md)). Admins have no refresh token,
so **an admin session lasts 15 minutes and then they sign in again**. Business users get the same
15-minute access token, but it is renewed from a 7-day refresh token that is replaced on every use.
A disabled admin loses access on their next request, not when their token runs out, and a sign-out
or password change ends every older token at once.

There are two kinds of admin:

- **The root admin** is the one account created by the seed job (`pnpm db:seed:admin:prod`). It is the
  only admin with no inviter.
- **Invited admins** join by an emailed link (`/accept-invite/<token>`), choosing a password,
  Google, or Microsoft (the Microsoft option is pinned to the configured admin Entra directory).

Any active admin can invite, revoke, enable and disable other admins. Because admins are peers, the
system only protects against locking everyone out:

- You cannot disable **yourself**.
- You cannot disable an admin who is still **invited**. Revoke the invitation instead.
- You cannot disable **the root admin**.
- You cannot disable **the last active admin**.

Repeating a request that changes nothing is a no-op: it writes no second activity-log row and sends no
second email.

See [Auth](../backend/auth/overview.md) and [Platform admin](../backend/platform-admin/overview.md)
for the full flows.
