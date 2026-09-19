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
block). All are declared `@IsOptional()`.

| Variable | Required | Purpose |
|---|---|---|
| `STORAGE_PROVIDER` | No, **default `noop`** | `cloudinary` \| `noop`. Any unset or unrecognized value falls through to `noop`, so the whole flow works with no credentials in any environment. Unlike `EmailModule`'s factory this is **not** forced to `noop` outside production — see the overview's [Storage providers](./overview.md#storage-providers) for why the asymmetry is deliberate. |
| `CLOUDINARY_CLOUD_NAME` | Only when `STORAGE_PROVIDER=cloudinary` | Embedded in the `uploadUrl` returned to the client. |
| `CLOUDINARY_API_KEY` | Only when `STORAGE_PROVIDER=cloudinary` | Returned to the client inside `formFields.api_key`. A public identifier, not a secret. |
| `CLOUDINARY_API_SECRET` | Only when `STORAGE_PROVIDER=cloudinary` | Signs the upload authorization and authenticates the server-to-Cloudinary verify read. Never leaves the backend, never appears in a response. |

**None of the three `CLOUDINARY_*` vars is validated as required when `cloudinary` is selected** —
each falls back to `''`, so a misconfigured deployment boots cleanly and fails at the first
upload. Flagged as a gap, not a contract.

`AWS_S3_BUCKET` and `AWS_S3_REGION` also sit in that env block. **Nothing reads them** —
`StorageProviderType` is `'cloudinary' | 'noop'` and there is no S3 provider. Setting them has no
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
| `provider` | `"cloudinary"` \| `"noop"` | Which `StorageProvider` the `STORAGE_PROVIDER` env var selected. Informational — never a per-request choice, and **not** the field a client branches on; see `uploadUrl`. |
| `uploadUrl` | string | Absolute URL to POST the file to. **Empty string** when there is nothing to upload to (`noop`) — that emptiness, not the provider name, is the branch a client implements. |
| `formFields` | `Record<string, string>` | Sent verbatim alongside `file`, and **opaque**: do not depend on individual key names. The signature covers these values, so dropping or editing any one of them makes the provider reject the upload. Always string-valued, including numeric ones like `timestamp`, so a client can append them to `FormData` without per-key conversion. |
| `providerAssetId` | string, optional | Present **only** when `provider` is `noop` — the id to confirm with, since there is no upload response to learn one from. |

When `STORAGE_PROVIDER=noop`, the same route answers with an empty `uploadUrl`, no form fields,
and the id to confirm with:

```json
{
  "provider": "noop",
  "uploadUrl": "",
  "formFields": {},
  "providerAssetId": "noop-9c3f0a1e-52d7-4b18-b0aa-7e6f2c4d9310"
}
```

That id is freshly generated per call (`noop-<uuid>`), not a fixed sentinel — though
`NoopStorageProvider.verifyUpload` accepts any id at all, so nothing actually depends on its
value. `ConfirmAvatarDto`'s own Swagger description still calls it "the fixed sentinel id"; that
description is stale, see the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design).

Errors: `401` (missing or expired access token), `403 TENANT_ONLY` (authenticated as a platform
admin), `429`, `500`.

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
| `providerAssetId` | string | required, 1–255 chars (matching `media.provider_asset_id`'s `VARCHAR(255)`). Cloudinary's `public_id` from the direct-upload response, or the id the `noop` authorization handed back. **Never trusted at face value** — it is readable in any rendered avatar URL, so it is treated as an attacker-supplied claim and checked, not as a fact. |

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
reference](#error-reference)), `429`, `500`.

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

**When `uploadUrl` is the empty string** — skip this step entirely. There is no provider to upload
to; hand `providerAssetId` from the authorization straight to the confirm route.
`NoopStorageProvider.verifyUpload` accepts any id and returns the same canned inline placeholder
avatar (a gray silhouette SVG as a `data:` URI, so the placeholder itself needs no network call —
the whole point of the provider is zero external dependencies) with `mimeType: "image/svg+xml"`.
Nothing is genuinely verified, because there is nothing behind it to verify against; it does not
pretend otherwise.

## Error reference

Every row is the standard error envelope (`statusCode`, `status: "Failure"`, `message`, `error`,
`traceId`, `data: null`) — see [Auth Module — API
Reference](../auth/api-reference.md#conventions).

| Status | Error (message key) | Routes | When |
|---|---|---|---|
| `400` | `Bad Request` (validation) | both confirm routes | `providerAssetId` missing, not a string, or outside 1–255 chars. Messages come from `ConfirmAvatarDto`'s own `class-validator` options, comma-joined by the filter. |
| `400` | `Bad Request` (`MEDIA.UPLOAD_NOT_VERIFIED`) | both confirm routes | The provider read failed, **or** the asset exists but sits in a different folder than the caller's. One message for both: either could equally be a client bug or someone probing confirm with a guessed id, and distinguishing them would tell the prober which guesses were close. Rendered `Could not verify the uploaded image.` |
| `400` | `Bad Request` (`MEDIA.UNSUPPORTED_FORMAT`) | both confirm routes | The asset is real and in the caller's own folder, but its format is not in the allowlist — `svg` above all, excluded because `media.url` is rendered directly in an `<img src>` with no sanitization. The **one** failure safe to name specifically: reaching this branch already requires a real asset the caller just uploaded through its own signed authorization, so nothing is disclosed, and "you picked the wrong file" is actionable. Rendered `This image format is not supported. Please upload a JPG, PNG, WEBP, GIF, AVIF, HEIC, or BMP file.` |
| `400` | `Bad Request` (`MEDIA.FILE_TOO_LARGE`) | both confirm routes | The asset is real and in the caller's own folder, but exceeds the 10 MB cap. Checked at confirm rather than in the signature because Cloudinary refuses to sign `max_file_size` (see the overview's size-cap note); the web client also pre-checks `file.size` so the user finds out before spending the upload. Rendered `That image is too large. Please upload a file under 10 MB.` |
| `401` | `Unauthorized` | all four | Missing, malformed, or expired access token. `JwtAuthGuard`, before any of this module's code runs. |
| `403` | `Forbidden` (`AUTH.TENANT_ONLY`) | tenant pair | A platform-admin token on a tenant route. Raised by `MediaService.assertActorType`, **not** by a guard: `TenantAvatarController` sits at `RouteNames.AUTH`, a prefix that also serves `@Public()` routes and therefore carries no `@Roles()` gate. Rendered `This action is only available to tenant users.` |
| `403` | `Forbidden` (generic) | admin pair | A tenant-user token on an admin route. Raised by `RolesGuard` from `@Roles(PLATFORM_ADMIN)` on the controller, so the body carries Nest's default `Forbidden resource`, **not** `MESSAGES.ADMIN.ADMIN_ONLY` — the service's own `ADMIN_ONLY` check is a second line of defence that this path never reaches. Worth knowing if a client is matching on message text. |
| `429` | `Too Many Requests` | all four | More than 10 requests / minute to that route, or one of the global tiers exceeded. `Retry-After` set. |
| `500` | `Internal Server Error` | both confirm routes | Unhandled. No longer reachable through the concurrency path that used to produce it: the first-upload / double-replacement races are closed by the advisory-locked transaction in `MediaRepository.upsertAvatar`. |

**There is no `404` anywhere in this module.** A confirm against an asset that does not exist is a
`400`, not a `404`, because the thing being addressed is the caller's claim about an upload, not a
resource on this API. And there is no route that takes a media id, so there is nothing to 404 on.

**Nothing here surfaces a failed cleanup.** If the best-effort delete of a displaced asset fails,
the response is still `200` — the new avatar is genuinely saved — and the only trace is a
`MediaService` warning log naming the orphaned `providerAssetId`.

## Security considerations

Most of these are stated once, in full, in the overview's [Security
model](./overview.md#security-model). Restated here only as the checklist a reviewer of this HTTP
surface should run:

- **The folder is the authorization, and it is derived twice.** Authorize signs
  `avatars/<owner-type>/<owner-id>`; confirm re-derives the identical value and rejects a
  mismatch. Cloudinary enforces the first half (an altered `folder` invalidates the signature);
  the backend enforces the second. **Neither half is redundant.** Drop the signing and a client
  uploads into someone else's folder; drop the confirm check and a client confirms an id it read
  off someone else's rendered avatar, repointing its own row at their asset — and its next upload
  then deletes that asset out from under them.
- **Every constraint that matters is inside the signature.** `folder`, `allowed_formats`, and
  `allowed_formats` are signed, not merely returned. An authorization is handed to a browser, so
  a constraint outside the signature is a constraint the client can drop — and the whole design
  assumes the client is hostile. This is also why `formFields` is documented as opaque and
  send-verbatim: a client that "cleans up" the bag breaks its own upload, which is the intended
  failure mode.
- **Nothing the client says about the file is persisted.** `url`, `mimeType`, and `sizeBytes` come
  from an authenticated server-to-Cloudinary read. The request body carries one field, and that
  field is checked rather than stored on trust. An implementation that accepted a client-supplied
  `url` would let any authenticated user set their avatar to an arbitrary remote image — or an
  arbitrary `javascript:`-shaped string, depending on how the frontend renders it.
- **Actor type is checked before an owner column is chosen.** `@CurrentUser()` guarantees a valid
  token of *some* type only. Without the check, a platform-admin token on the tenant confirm route
  writes their id into `user_id` — the wrong column, caught only as an FK-violation `500` if that
  id happens not to exist in `users`, and silently correct-looking if it does.
- **One error message is specific, the rest are not, and that split is the contract.**
  `UNSUPPORTED_FORMAT` names formats; `UPLOAD_NOT_VERIFIED` covers "no such asset" and "someone
  else's asset" with one string. Adding a third, more helpful message ("that asset belongs to
  another user") would turn confirm into an existence oracle for asset ids.
- **SVG is excluded as a security control, not a capability gap.** `media.url` renders directly in
  an `<img src>` with no sanitization step, and an SVG can carry a `<script>`. Adding
  `svg: 'image/svg+xml'` to `FORMAT_TO_MIME_TYPE` would make avatar upload a stored-XSS vector —
  and, because `allowed_formats` is derived from that same map's keys, would open the provider
  door in the same edit. (The `noop` provider's placeholder *is* an SVG data URI — safe, because
  it is a server-side constant delivered as a `data:` URI, which does not execute script in an
  `<img>`. See the overview's [Gap](./overview.md#gap-between-current-code-and-target-design).)
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
