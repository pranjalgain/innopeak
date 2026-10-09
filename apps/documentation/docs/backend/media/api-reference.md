---
sidebar_position: 2
---

# Media Module — API Reference

## How to read this document

This document describes **shipped code**, not a target design. All four routes below are
implemented (`src/api/media/controllers/`), `0010_media.sql` is applied, and the web app already
drives the flow end to end (`apps/web/src/app/_libs/services/avatar-upload.service.ts`). Where
something is missing rather than built — there is no delete-avatar route, for instance — this
document says so in place rather than describing it as though it existed; the full list is in the
overview's [Gap](./overview.md#gap-between-current-code-and-target-design).

It assumes you have read [Media Module — Overview](./overview.md) for the data model, the
replace-in-place semantics, and — above all — the [security model](./overview.md#security-model)
that explains *why* the two-call shape below is safe. This document turns those into concrete
request/response contracts rather than repeating them.

One thing this document has to cover that most others don't: **step 2 of the flow is a request the
client makes to Cloudinary, not to this API.** It is specified in [The direct upload
step](#the-direct-upload-step) because the contract between the two InnoPeak calls is meaningless
without it.

Deliberately HTTP-contract-level only — no controller or decorator code. Each route lives under
`src/api/media/` per `apps/backend/docs/conventions/module-structure.md`, with one
`swagger/<controller-name>.swagger.ts` file per controller: the JSON shown here is what that
route's Swagger decorator should render as its example. Every success and error `message` string
comes from `src/common/constants/messages.constants.ts`, never an inline literal.

## Conventions

- **Base paths**: `/v1/auth` (`RouteNames.AUTH`) for the tenant pair and `/v1/admin/settings`
  (`RouteNames.ADMIN_SETTINGS`) for the platform-admin pair, both `version: '1'` in
  `@Controller()`. Those are the two **profile screens'** prefixes, not this module's — the
  controllers belong to `MediaModule` regardless, see the overview's [API
  surface](./overview.md#api-surface). Route slugs are `RouteNames.AVATAR_AUTHORIZE` /
  `AVATAR_CONFIRM` and `ADMIN_SETTINGS_AVATAR_AUTHORIZE` / `ADMIN_SETTINGS_AVATAR_CONFIRM`;
  controller paths are never raw strings.
- **Auth column**: every route needs `Authorization: Bearer <access_token>` (or the equivalent
  `access_token` cookie — `JwtStrategy` reads the cookie first, then the header). Nothing here is
  `@Public()`. The **tenant** pair additionally requires `type === 'tenant_user'` and the
  **admin** pair `type === 'platform_admin'`; the two are enforced differently and that difference
  is visible in the response body, see [Error reference](#error-reference).
- **Owner comes from the token, never the request.** No route in this module names a user or an
  admin. The owner is read from the authenticated principal, and it is what derives the
  provider-side folder the upload is signed for. There is no path, query, or body parameter
  anywhere in this module that identifies who the avatar belongs to — by design, see the
  overview's [Security model](./overview.md#security-model).
- **All four are `POST`, all four answer `200`.** `@HttpCode(HttpStatus.OK)` is explicit on every
  handler. Neither call creates a resource the client subsequently addresses by id, so `201` would
  promise a `Location` that does not exist.
- **Success and error envelopes**: identical to every other module — `TransformInterceptor` wraps
  2xx bodies, `HttpExceptionFilter` + `ErrorHandlerService` shape non-2xx ones
  (`src/common/dto/api-response.ts`). The `data` shapes below are the *inner* payload. Rather than
  restate both envelopes, their `traceId` semantics, and how `class-validator` failures collapse
  into one comma-joined `message`, see [Auth Module — API
  Reference](../auth/api-reference.md#conventions) — that section is the full version and this
  module adds nothing to it.
- **Throttling**: all four routes carry `@Throttle({ short: { limit: 10, ttl: 60000 } })` — 10
  requests / minute, replacing only the global `short` tier; the `medium`, `long`, and `very-long`
  tiers still apply on top. Ten a minute is generous for a human changing their profile picture
  and tight enough that the confirm routes are not a comfortable place to enumerate asset ids
  from.
- **Locale**: both confirm routes' envelope `message` is a locale key resolved per request
  (`MESSAGES.AUTH.AVATAR_UPDATED` / `MESSAGES.ADMIN.AVATAR_UPDATED`, `Avatar updated.` in English,
  with a German rendering in `@common/i18n/messages.de`). Both authorize routes pass no message
  and fall back to `MESSAGES.COMMON.SUCCESS` (`Success`). Examples below show the English
  rendering.

## Configuration

Environment variables read by this module (`src/config/env.config.ts`, the `// ─── Media ───`
block). Required in production, optional elsewhere.

| Variable | Required | Purpose |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Production | Embedded in the `uploadUrl` returned to the client. |
| `CLOUDINARY_API_KEY` | Production | Returned to the client inside `formFields.api_key`. A public identifier, not a secret. |
| `CLOUDINARY_API_SECRET` | Production | Signs the upload authorization and authenticates the server-to-Cloudinary verify read. Never leaves the backend, never appears in a response. |

Cloudinary is the only storage provider; there is no offline stand-in. When any of the three is
empty the server still boots, and the authorize routes answer `503 STORAGE_NOT_CONFIGURED`.

`AWS_S3_BUCKET` and `AWS_S3_REGION` also sit in that env block. **Nothing reads them** —
`StorageProviderType` is `'cloudinary'` and there is no S3 provider. Setting them has no
effect.

## Tenant avatar

Backs Settings → Profile → profile picture in the tenant dashboard.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/auth/avatar/authorize` | Bearer, tenant user | 10 / min |
| `POST` | `/v1/auth/avatar/confirm` | Bearer, tenant user | 10 / min |

### `POST /v1/auth/avatar/authorize`

Mints a provider-signed authorization the client uses to upload the new avatar **directly to the
provider**. The backend never receives the file. No request body — the owner, and therefore the
folder the upload is signed for, comes entirely from the access token.

The folder is `avatars/users/<users.id>`. It is signed, not merely suggested: Cloudinary rejects
an upload whose submitted fields differ from the signed ones, and the confirm route below
re-derives the same folder and checks the asset actually landed there. See the overview's
[Security model](./overview.md#security-model) — this is the single mechanism preventing one owner
from confirming another's asset, so neither half may be relaxed on its own.

Success `200` (`AvatarUploadAuthorizationResponseDto`), envelope `message` `Success`:

```json
{
  "provider": "cloudinary",
  "uploadUrl": "https://api.cloudinary.com/v1_1/innopeak-demo/image/upload",
  "formFields": {
    "api_key": "123456789012345",
    "signature": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    "timestamp": "1758182400",
    "folder": "avatars/users/0190f3b2-7c41-7a20-8f5e-2d9b6c1a4e88",
    "allowed_formats": "jpg,jpeg,png,webp,gif,avif,heic,heif,bmp"
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `provider` | `"cloudinary"` | The `StorageProvider` in use. Informational. |
| `uploadUrl` | string | Absolute URL to POST the file to. |
| `formFields` | `Record<string, string>` | Sent verbatim alongside `file`, and **opaque**: do not depend on individual key names. The signature covers these values, so dropping or editing any one of them makes the provider reject the upload. Always string-valued, including numeric ones like `timestamp`, so a client can append them to `FormData` without per-key conversion. |

Errors: `401` (missing or expired access token), `403 TENANT_ONLY` (authenticated as a platform
admin), `429`, `500`, `503 STORAGE_NOT_CONFIGURED`.

### `POST /v1/auth/avatar/confirm`

Tells the backend which asset the direct upload produced. The backend then **independently
verifies it against the provider** before persisting anything, and returns the URL to render.

Request (`ConfirmAvatarDto`):

```json
{
  "providerAssetId": "avatars/users/0190f3b2-7c41-7a20-8f5e-2d9b6c1a4e88/hx7k2pqz9vnr1c3ybwme"
}
```

| Field | Type | Rules |
|---|---|---|
| `providerAssetId` | string | required, 1–255 chars (matching `media.provider_asset_id`'s `VARCHAR(255)`). Cloudinary's `public_id` from the direct-upload response. **Never trusted at face value** — it is readable in any rendered avatar URL, so it is treated as an attacker-supplied claim and checked, not as a fact. |

What the server does with it, in order:

1. Re-derives `avatars/users/<caller's id>` from the access token — never from the request.
2. Reads the asset back through Cloudinary's Admin API (an authenticated, signed server-to-server
   call). A read failure is `400`.
3. Requires the asset's `asset_folder` to equal the re-derived folder. A mismatch is the same
   `400`, with the same generic message — see [Error reference](#error-reference) for why these
   two are not told apart.
4. Maps the reported `format` to a MIME type through the allowlist in
   `cloudinary-storage.provider.ts`. An unmapped format — `svg` most notably, excluded on purpose
   — is a `400` with the one message that *is* specific. (In practice Cloudinary should already
   have refused it at upload, since the same list is signed into `allowed_formats`; this is the
   backstop, and it is also what produces the persisted `mime_type`.)
5. Upserts the owner's single `media` row (`kind = 'avatar'`) inside a transaction held behind a
   per-owner advisory lock, persisting `url`, `mimeType`, and `sizeBytes` **as Cloudinary reported
   them**, not as the client described them.
6. After that write commits, fires a best-effort delete of the displaced asset, if any. A failure
   there is logged and does not affect the response. Re-confirming the id the row already holds
   displaces nothing and deletes nothing — see the overview's [Replace-in-place
   semantics](./overview.md#replace-in-place-semantics).

Success `200` (`ConfirmAvatarResponseDto`), envelope `message` is `MESSAGES.AUTH.AVATAR_UPDATED`
(`Avatar updated.`):

```json
{
  "avatarUrl": "https://res.cloudinary.com/innopeak-demo/image/upload/v1758182412/avatars/users/0190f3b2-7c41-7a20-8f5e-2d9b6c1a4e88/hx7k2pqz9vnr1c3ybwme.png"
}
```

Deliberately just the avatar, not the caller's refreshed profile. `MediaService` has no idea what
a tenant-owner profile looks like and should not need to — that is exactly the coupling that would
have to grow with every new avatar owner. The caller already holds the rest of its own profile and
needs this one field updated. The same `avatarUrl` subsequently appears on
[`GET /v1/auth/me`](../auth/api-reference.md#get-v1authme), which composes it in via
`MediaService.getUserAvatarUrl`.

`avatarUrl` is typed nullable because the DTO is shared with reads that can legitimately have no
avatar; on a successful confirm it is never `null`.

Errors: `400` validation, `400 UPLOAD_NOT_VERIFIED`, `400 UNSUPPORTED_FORMAT`, `401`,
`403 TENANT_ONLY`, `429`, `500`.

## Platform admin avatar

Backs the platform-admin console's Settings → Profile picture. Structurally identical to the
tenant pair — same DTOs, same service, same verification — differing only in which owner column
the row lands in and which folder the upload is signed for.

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/admin/settings/profile/avatar/authorize` | Bearer, `@Roles(PLATFORM_ADMIN)` | 10 / min |
| `POST` | `/v1/admin/settings/profile/avatar/confirm` | Bearer, `@Roles(PLATFORM_ADMIN)` | 10 / min |

### `POST /v1/admin/settings/profile/avatar/authorize`

As [the tenant route](#post-v1authavatarauthorize), with the folder derived as
`avatars/platform-admins/<platform_admins.id>`. No request body.

Success `200`:

```json
{
  "provider": "cloudinary",
  "uploadUrl": "https://api.cloudinary.com/v1_1/innopeak-demo/image/upload",
  "formFields": {
    "api_key": "123456789012345",
    "signature": "4f81c0be29a7d3516e0f8a24bd93c7015aef6802",
    "timestamp": "1758182400",
    "folder": "avatars/platform-admins/0190f3aa-1b52-7c39-90d4-5ef8a2c6b710",
    "allowed_formats": "jpg,jpeg,png,webp,gif,avif,heic,heif,bmp"
  }
}
```

The `users` / `platform-admins` segment is not cosmetic: keeping the two id spaces in separate
subtrees means a `users.id` and a `platform_admins.id` can never collide into the same folder, in
the tree or in a reviewer's head.

Errors: `401`, `403` (not a platform admin — raised by `RolesGuard`, see [Error
reference](#error-reference)), `429`, `500`, `503 STORAGE_NOT_CONFIGURED`.

### `POST /v1/admin/settings/profile/avatar/confirm`

As [the tenant confirm route](#post-v1authavatarconfirm), verified against the admin's own folder
and persisted with `platform_admin_id` set and `user_id` NULL.

Request:

```json
{
  "providerAssetId": "avatars/platform-admins/0190f3aa-1b52-7c39-90d4-5ef8a2c6b710/q4mz8wtv2ynb6da1jkrc"
}
```

Success `200`, envelope `message` is `MESSAGES.ADMIN.AVATAR_UPDATED` (`Avatar updated.`):

```json
{
  "avatarUrl": "https://res.cloudinary.com/innopeak-demo/image/upload/v1758182455/avatars/platform-admins/0190f3aa-1b52-7c39-90d4-5ef8a2c6b710/q4mz8wtv2ynb6da1jkrc.webp"
}
```

The same value then appears on
[`GET /v1/admin/settings/profile`](../platform-admin/api-reference.md), which composes it in via
`PlatformAdminDbService.findById` — `platform_admins` has no `avatar_url` column any more, so that
profile read is inherently two reads joined in the DB Service layer.

Errors: `400` validation, `400 UPLOAD_NOT_VERIFIED`, `400 UNSUPPORTED_FORMAT`, `401`, `403`,
`429`, `500`.

## The direct upload step

Between `authorize` and `confirm` the client makes **one request that does not reach this API at
all**. It is part of the contract, so it is specified here.

**When `uploadUrl` is non-empty** — `POST` a `multipart/form-data` body to that exact URL
containing:

| Form field | Value |
|---|---|
| `file` | The image itself. |
| *every entry of `formFields`* | Appended verbatim, key and value as given. |

Do not reorder, rename, filter, or re-type them, and do not add signed-eligible fields of your
own. The signature covers those values, so any edit makes the provider reject the upload — which
is precisely what stops a client uploading outside its own owner-scoped folder, above a signed
size cap, or in a format the backend would refuse to persist.

**The provider generates the asset id itself** — the signed fields pin down the folder, timestamp,
formats, and size, not the id — so it has to be read back out of the upload response
(Cloudinary: `public_id`) rather than predicted client-side. That value is what goes into the
confirm call's `providerAssetId`.

**Rejections here are the provider's, not this API's.** An oversized file or a disallowed format
comes back as a Cloudinary error response with a Cloudinary status code; nothing reaches InnoPeak,
and nothing is stored. The web client wraps these in its own `AvatarUploadError` specifically so
"your file is the problem" stays distinguishable from "our API is the problem" — the former is
worth repeating to the user verbatim, the latter is not.

- **SVG is excluded as a security control, not a capability gap.** `media.url` renders directly in
  an `<img src>` with no sanitization step, and an SVG can carry a `<script>`. Adding
  `svg: 'image/svg+xml'` to `FORMAT_TO_MIME_TYPE` would make avatar upload a stored-XSS vector —
  and, because `allowed_formats` is derived from that same map's keys, would open the provider
  door in the same edit.
- **The API secret never leaves the backend.** `formFields.api_key` and the cloud name inside
  `uploadUrl` are returned to the client and are public identifiers by design;
  `CLOUDINARY_API_SECRET` appears in no response, and the signature it produces covers only that
  one authorization's timestamp, folder, formats, and size cap — it cannot be replayed to
  authorize an upload anywhere else.
- **The upsert is serialized per owner, not globally.** `pg_advisory_xact_lock` is keyed on the
  owner id, so one owner's concurrent confirms queue while unrelated owners never contend. Do not
  "simplify" it to a single lock key: that turns every avatar confirm in the system into a queue
  behind one lock.
- **Provider-side deletes happen after the DB write commits, and are best-effort.** A failure
  leaves an orphaned asset in storage (a cost problem) rather than a `media` row pointing at an
  asset that no longer exists (a correctness problem). Do not "improve" this by awaiting the
  delete before the write.
