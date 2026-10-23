---
sidebar_position: 1
---

# Media Module

## Overview

The media module owns every file this product stores on a third-party asset host, and the one
table that records what was stored. Today that is exactly one thing: the **profile avatar**, for
the two kinds of principal the auth module authenticates — tenant users (`users`) and platform
admins (`platform_admins`). There is no second `kind` of media yet.

Two structural decisions make that "today" load-bearing rather than incidental, and both are in
`0010_media.sql`:

- `media.kind` is a Postgres enum (`media_kind`) with a single value, `'avatar'`. A second kind
  (a business logo, a review attachment) is an enum value plus a pair of service methods, not a
  new table.
- Ownership is a **nullable-FK pair plus a CHECK constraint** (`user_id` / `platform_admin_id`,
  exactly one non-NULL), the same shape `platform_activity_log` (`0009_admin_overview.sql`)
  already uses for "one of two owner tables." Deliberately not a generic `(owner_type, owner_id)`
  polymorphic pair: an untyped id column cannot be a real foreign key, which costs referential
  integrity and `ON DELETE CASCADE` — and deleting a user has to take their avatar row with it.

The upload itself is **direct-to-provider**: the file goes from the browser straight to
Cloudinary, and the backend never receives the bytes. What the backend does instead is mint a
signed authorization scoped to the caller, and then independently re-verify against Cloudinary's
Admin API what actually landed before it writes a row. That two-call shape is the whole module —
see [Upload flow](#upload-flow) and, more importantly, [Security model](#security-model), which
is where the reasoning that makes the flow safe actually lives.

This module retires `platform_admins.avatar_url`. That column was a plain `VARCHAR` on one of the
two owner tables; `0001_platform_admin.sql`'s header records the move. A string column cannot be
shared across two owner tables with real FK integrity, so as soon as tenant-user avatars needed
the same storage, both owners had to reach avatars through the same path or the two would have
diverged immediately.

This document covers the data model, the flow, the security model, and the provider abstraction.
For the endpoint-by-endpoint contract — the four routes' request/response shapes, the client's
own obligations between the two calls, and every error code — see [Media Module — API
Reference](./api-reference.md).

## Data model

| Table | Purpose |
|---|---|
| `media` | **Owned.** One row per stored asset. `kind` (`media_kind`: `avatar`), `user_id` / `platform_admin_id` (both nullable FKs, `ON DELETE CASCADE`, exactly one non-NULL per `media_exactly_one_owner`), `provider` (`VARCHAR(50)`), `provider_asset_id` (`VARCHAR(255)`), `url` (`VARCHAR(2048)`), `mime_type` (`VARCHAR(100)`), `size_bytes` (`INTEGER`), `created_at`, `updated_at`. |
| `users` | **Read-only, foreign.** The FK target for a tenant-user avatar. Owned by auth. |
| `platform_admins` | **Read-only, foreign.** The FK target for a platform-admin avatar. Owned by auth. Note it no longer has an `avatar_url` column of its own. |

Three columns are worth reading carefully, because they encode decisions rather than just data:

- **`provider`** records *which* `StorageProvider` holds this particular asset, independent of
  whichever provider happens to be configured now. A later S3 provider's rows and a Cloudinary
  provider's rows can sit in the same table without either guessing the other's shape. (The code
  does not yet act on this — see [Gap](#gap-between-current-code-and-target-design).) It is a
  `VARCHAR(50)`, not an enum, precisely so adding a provider is a code change and not a migration.
- **`provider_asset_id`** is the provider's own handle (Cloudinary's `public_id`), opaque to
  everything above the provider layer, kept only so a later delete or replace can hand it back to
  that same provider. The migration says it is never returned to a client — true of this module's
  *responses*, but not a secret: a Cloudinary `secure_url` contains the `public_id`, so any
  rendered avatar discloses it. The security model assumes that rather than relying on it staying
  hidden.
- **`url`** is the fully-qualified asset URL the frontend renders directly in an `<img src>`,
  with no sanitization step in between. That fact is what makes the accepted-format list a
  security control and not a convenience — see [Accepted formats](#accepted-formats).

### One current avatar per owner

Two partial unique indexes make "this owner's current avatar" a single, well-defined row:

```sql
CREATE UNIQUE INDEX idx_media_user_kind ON media(user_id, kind) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_media_platform_admin_kind ON media(platform_admin_id, kind) WHERE platform_admin_id IS NOT NULL;
```

Partial because of the nullable-FK pair: a tenant-user row has `platform_admin_id IS NULL`, and
without the `WHERE` every admin-owned row would collide with every other one on
`(NULL, 'avatar')`. Two indexes rather than one composite for the same reason — there is no single
"owner" column to index.

They double as the lookup index for the read (`MediaRepository.findAvatar`), so no separate index
exists to serve that query. The consequence for `src/db/repositories/media/media.repository.ts` is
that every method reads or writes *the* row directly, with no "which of these is the current one"
flag or ordering to apply.

## Upload flow

Three steps, and the middle one does not involve this backend at all.

```mermaid
sequenceDiagram
    participant C as Browser
    participant API as InnoPeak API<br/>(MediaModule)
    participant CL as Cloudinary
    C->>API: 1. POST .../avatar/authorize (bearer)
    API->>API: folder := avatarFolderFor(authenticated owner)
    API-->>C: { provider, uploadUrl, formFields }
    C->>CL: 2. POST file + formFields verbatim (direct upload)
    CL-->>C: { public_id }
    C->>API: 3. POST .../avatar/confirm { providerAssetId }
    API->>CL: Admin API: read this asset
    CL-->>API: { secure_url, format, bytes, asset_folder }
    API->>API: re-derive folder, compare; map format → MIME
    API->>API: upsert media row (locked, replace in place)
    API--)CL: delete displaced asset (best effort, after commit)
    API-->>C: { avatarUrl }
```

**Why direct-to-provider rather than proxying the file through the API.** The backend never
allocates a buffer for, streams, or scans an image it has no interest in; there is no multipart
body-size limit to raise past the global `1mb` `body-parser` cap, no temporary file, and no
upload-bandwidth cost on the API tier.

**Why the authorization is a URL plus opaque form fields, and not named provider-specific
parameters.** `UploadAuthorization` (`src/api/media/types/storage-provider.type.ts`) is
`{ provider, uploadUrl, formFields }`: the client POSTs `file` plus every
`formFields` entry, verbatim, to `uploadUrl`, and never picks through the bag by key. An earlier
shape handed back a provider-specific `params` object the client destructured field by field,
which made every field name a silent contract between two codebases — rename one server-side and
the client kept compiling and started failing at runtime. Treating the fields as opaque means
adding, renaming, or signing an extra parameter is a backend-only change.

**Why confirm re-verifies instead of accepting the client's word.** Step 2's response is read by
the client, so everything the client then reports about it — the URL, the format, the byte size —
is attacker-controlled by construction. `MediaService.confirmAvatar` persists nothing that
`StorageProvider.verifyUpload` has not itself vouched for: `url`, `mimeType`, and `sizeBytes` all
come from an authenticated, signed server-to-Cloudinary Admin API read, never from the request
body. The request body carries exactly one field, `providerAssetId`, and even that is treated as a
claim to be checked rather than a fact.

## Security model

This is the part to get right; the rest of the module is plumbing around it.

### The folder is the binding

`avatarFolderFor` (`src/api/media/utils/avatar-folder.util.ts`) derives a provider-side folder
from the **authenticated** owner and nothing else:

| Owner | Folder |
|---|---|
| Tenant user | `avatars/users/<users.id>` |
| Platform admin | `avatars/platform-admins/<platform_admins.id>` |

`users` / `platform-admins` are kept as distinct path segments rather than bare ids so the two id
spaces can never be confused for one another — in the folder tree or in a reviewer's head.

Both halves of the flow derive that folder independently, and neither ever accepts it from the
client:

1. **Authorize signs it.** `CloudinaryStorageProvider.createUploadAuthorization` signs
   `{ timestamp, folder, allowed_formats }`. Cloudinary rejects any upload whose
   submitted fields differ from the ones covered by the signature, so the file *physically cannot*
   land anywhere else — a client that edits the `folder` form field just invalidates the signature
   it was given.
2. **Confirm re-derives it and compares.** `verifyUpload` reads the asset back from the Admin API
   and requires `asset_folder === expectedFolder`, refusing to confirm otherwise.

Together those two are what stop one owner claiming another owner's asset. A `public_id` is
readable by anyone who can see a rendered avatar URL, so without the folder check, POSTing someone
else's id to confirm would point your own `media` row at their asset — and your next upload would
then delete it out from under them, since the displaced asset is cleaned up by id.

`asset_folder`, not `folder`, is the field checked: this Cloudinary account is on dynamic-folder
mode (the default for newer accounts), where the Admin API reports the asset's actual folder in
`asset_folder` and leaves the older fixed-folder mode's `folder` field empty. Getting this wrong
fails closed — an empty string never equals the expected folder — but it fails closed on *every*
upload, so it would present as "confirm is broken," not as a security hole.

### Format is capped in the signature; size is capped at confirm

| Constraint | Where enforced | Why there |
|---|---|---|
| Format — `jpg,jpeg,png,webp,gif,avif,heic,heif,bmp` | Signed as `allowed_formats`, so Cloudinary refuses the upload at the door | Mirrors `FORMAT_TO_MIME_TYPE`'s keys exactly — anything `verifyUpload` would refuse to persist should never have been stored in the first place. |
| Size — 10 MB (`MAX_UPLOAD_BYTES`) | `verifyUpload`, against the Admin API's reported `bytes`, plus a client-side pre-check for fast feedback | **`max_file_size` cannot be signed.** Cloudinary strips it before computing its own expected signature (its rejection echoes `String to sign - 'allowed_formats&folder&timestamp'`), so including it makes every signature mismatch and every upload fail. Verified the hard way. Cloudinary's own account-level limit also refuses oversized files independently. |

Both are in the signature rather than merely in the response, and that is the whole point: **an
authorization is handed to the browser, so any constraint not covered by the signature is a
constraint the client can simply drop.** Signing them means Cloudinary refuses an oversized or
wrong-format upload at the door — one round trip earlier than confirm would have caught it, and,
more to the point, without the asset ever being stored. The backend still re-checks format at
confirm, because the format gate is also what produces the persisted `mime_type`; it does not
re-check size, which is recorded as reported.

### Actor type is checked in the service, not left to the guard

`@CurrentUser()` guarantees a *valid* JWT of *some* type; it does not guarantee the type matches
the route. `TenantAvatarController` is mounted at `RouteNames.AUTH`, a prefix that also serves
`@Public()` routes and therefore carries no `@Roles()` gate — nothing at the guard layer stops a
platform-admin token reaching `POST /v1/auth/avatar/confirm`.

So `MediaService` exposes four actor-checked entry points
(`getAvatarUploadAuthorizationForTenant` / `ForAdmin`, `confirmAvatarForTenant` / `ForAdmin`),
each of which asserts `actor.type` before choosing an owner column. Without that check, a platform
admin calling the tenant confirm route would write a `media` row with their own id in `user_id` —
the wrong owner column, and caught only as a raw FK-violation `500` if that id happened not to
exist in `users`.

`AdminAvatarController` additionally carries `@Roles(JwtTokenType.PLATFORM_ADMIN)`, so on the
admin pair the guard rejects a tenant token first and the service check is the second line rather
than the only one. The two produce different response bodies for the same condition — see the
[error reference](./api-reference.md#error-reference).

### Only one failure reason is safe to name

`verifyUpload` returns a discriminated failure rather than a bare `null`, with three reasons, and
`MediaService.confirmAvatar` maps them through `VERIFICATION_FAILURE_MESSAGES` on purpose:

- **`unsupportedFormat` → a specific message** naming the formats that are accepted. Reaching this
  branch already requires a real asset, in the caller's own folder, that the caller itself just
  uploaded through its own signed authorization. There is nothing left to disclose, and the error
  is genuinely actionable: the user picked the wrong file.
- **`tooLarge` → a specific message** naming the 10 MB limit. Safe and actionable for exactly the
  same reason as `unsupportedFormat`: the caller already owns the asset it is asking about.
- **A rejected upload is deleted.** On `unsupportedFormat` or `tooLarge` the provider removes the asset it just inspected (best-effort, after
  the folder check, so only an upload in the caller's own folder is ever touched; the rejection answer does not depend on it). An upload
  that is never confirmed at all (the browser closes between upload and confirm) is not swept: that needs a Cloudinary search over the
  avatar folders, which is not built.
- **`notFound` → the generic "Could not verify the uploaded image."** This one reason covers both
  "no such asset" and "the asset is in someone else's folder," collapsed deliberately. Either could
  equally be a client bug or someone probing the confirm endpoint with a guessed id, and telling
  those apart would tell the prober which guesses were close.

### Accepted formats

`FORMAT_TO_MIME_TYPE` in `src/api/media/providers/cloudinary-storage.provider.ts` is the single
allowlist — it gates what Cloudinary will accept (via the signed `allowed_formats`, derived from
its keys) *and* supplies the `media.mime_type` value that gets persisted, since Cloudinary reports
a bare extension (`"jpg"`) rather than a MIME type:

| Cloudinary `format` | Stored `mime_type` |
|---|---|
| `jpg`, `jpeg` | `image/jpeg` |
| `png` | `image/png` |
| `webp` | `image/webp` |
| `gif` | `image/gif` |
| `avif` | `image/avif` |
| `heic`, `heif` | `image/heic` / `image/heif` |
| `bmp` | `image/bmp` |

`heic`/`heif` and `avif` are on the list because they are what a phone's default camera actually
produces (iOS, and increasingly elsewhere) — a list that only accepted JPEG and PNG would reject
most real uploads from a mobile browser.

**`svg` is excluded deliberately, and it is the one exclusion that is a security control rather
than a capability limit.** Unlike every format above, an SVG's "image" can carry a `<script>`
element, and this app renders `media.url` directly in an `<img src>` with no sanitization step.
Accepting SVG would make avatar upload a stored-XSS vector. It is not an oversight to be "fixed"
by adding the entry — and because `allowed_formats` is derived from this same map, adding it would
silently open the provider door too.

## Replace-in-place semantics

`media` stores current state, not history. An owner's first confirmed upload inserts the row;
every upload after that **updates that same row** rather than adding a second one — which is
exactly what the partial unique indexes above make possible, and what they would reject if the
code tried otherwise.

**The whole read-decide-write is one transaction behind a per-owner advisory lock**
(`MediaRepository.upsertAvatar`), the same shape `PlatformAdminRepository.setStatusGuardingLastActive`
uses:

```sql
SELECT pg_advisory_xact_lock(hashtext('media:avatar'), hashtext(<owner id>))
```

The lock is keyed on the owner id, so two different people uploading simultaneously never wait on
each other — only one owner's own concurrent confirms serialize. It closes two races that the
earlier read-then-write version had live:

- **Two concurrent *first* uploads** both saw no row, both inserted, and the loser hit the
  `(owner, kind)` partial unique index as a raw `23505` — a `500` to the user plus an asset
  orphaned in storage.
- **Two concurrent *replacements*** both read the same previous row and both reported it as
  displaced, so the old asset was deleted twice and whichever upload lost the write was orphaned
  forever.

`MediaDbService.upsertAvatar` sits above that and adds one decision: whether anything was actually
*orphaned*. Confirming the id the row already holds — a double-clicked button, a client retry, a
refresh that re-submits — displaces nothing, because the row points exactly where it did.
Reporting it as `previousAsset` anyway made the caller delete the very asset it had just saved,
answering `200` while leaving the avatar a permanent 404. So `previousAsset` is non-null only when
the stored `providerAssetId` or `provider` actually changed.

**The provider-side delete happens after the DB write has committed, and is best-effort.**
`MediaService.confirmAvatar` fires `storageProvider.delete(previousAsset.providerAssetId)` without
awaiting it, catching and logging any failure. The ordering is the point: a failure there leaves
an orphaned asset sitting in storage — which costs money and nothing else — whereas deleting first
and then failing to commit would leave a live `media` row pointing at an asset that no longer
exists. An orphan is recoverable; a broken avatar URL in the database is not.

`CloudinaryStorageProvider.delete` **throws on anything but a confirmed deletion**, which is
subtler than it looks: `uploader.destroy` *resolves* for failures too — `{result: 'not found'}`
for an id that is not there, `{result: 'error'}` for a rejected call — rather than rejecting.
Taking the resolve at face value meant the caller's best-effort `.catch()` never fired and every
failed cleanup passed silently, which is exactly the case that leaves an asset orphaned with
nobody any the wiser.

One limit is accepted rather than fixed, and it is recorded in the code: **the delete uses the
currently active provider, not `previousAsset.provider`.** If the active provider is ever swapped
while assets from a previous one still exist, cleaning those up needs a provider registry keyed by
the stored column, not the single injected instance the constructor has. Out of scope while only
one provider is ever configured — but this is the reason the `provider` column exists, so the
column is ahead of the code here, not redundant.

## Storage providers

A two-class abstraction with Cloudinary as the only implementation. There is no offline stand-in:
local development uses a Cloudinary account's free tier.

| Class | Role |
|---|---|
| `StorageProvider` (abstract) | The contract: `type`, `isConfigured`, `createUploadAuthorization`, `verifyUpload`, `delete`. The DI token every consumer injects. |
| `CloudinaryStorageProvider` | Signs uploads with the Cloudinary SDK, verifies via its Admin API, deletes via `uploader.destroy` (and checks the result). |

`MediaModule` binds `StorageProvider` straight to `CloudinaryStorageProvider`; the class stays
private to this module, so nothing outside `MediaService` talks to a provider directly.

**Credentials are checked when an upload is requested, not at boot.** `isConfigured()` is true only
when cloud name, API key and API secret are all set. `MediaService.getAvatarUploadAuthorization`
checks it first and answers `503 STORAGE_NOT_CONFIGURED` otherwise, so a server without Cloudinary
credentials still boots and everything except avatar upload works. All three variables are required
in production (Joi); locally they may stay empty.

The environment variables are in the `// ─── Media ───` block of `src/config/env.config.ts`:

| Variable | Required | Purpose |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Production | Cloud name; the `uploadUrl` returned to the client embeds it. |
| `CLOUDINARY_API_KEY` | Production | Returned to the client inside `formFields`. A public identifier, not a secret. |
| `CLOUDINARY_API_SECRET` | Production | Signs the upload authorization and authenticates the server-to-Cloudinary verify read. **Never leaves the backend.** |

## API surface

Four routes, two pairs, one pair per profile screen. Both pairs are `POST`, both answer `200`
(not `201` — neither creates a resource the client addresses afterwards), and all four are
throttled at 10 / minute on top of the global tiers.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/v1/auth/avatar/authorize` | Bearer, tenant user | Mints the signed upload authorization for `avatars/users/<id>`. |
| `POST` | `/v1/auth/avatar/confirm` | Bearer, tenant user | Verifies and persists; returns the new `avatarUrl`. |
| `POST` | `/v1/admin/settings/profile/avatar/authorize` | Bearer, `@Roles(PLATFORM_ADMIN)` | Same, for `avatars/platform-admins/<id>`. |
| `POST` | `/v1/admin/settings/profile/avatar/confirm` | Bearer, `@Roles(PLATFORM_ADMIN)` | Same. |

**These four live on `MediaModule`'s own controllers despite being mounted under the auth and
admin path prefixes**, and that split is deliberate rather than an accident of where the code was
written. NestJS registers a controller by the module that declares it, not by its path prefix, so
`TenantAvatarController` can sit at `RouteNames.AUTH` and `AdminAvatarController` at
`RouteNames.ADMIN_SETTINGS` without either module importing anything back. The path prefixes
follow the product — an avatar is Settings → Profile's picture on both screens, not a separate
resource a client would discover on its own — while the ownership follows the code: a future third
avatar owner, or a second media `kind`, means adding another controller *here*, never editing
`AuthController` or `AdminSettingsController`.

`MediaService` also exposes owner-agnostic read/write methods that are **not** HTTP routes and are
called by other modules directly: `getUserAvatarUrl`, `getPlatformAdminAvatarUrl`, and the plain
`confirmUserAvatar` / `confirmPlatformAdminAvatar`. The actor check is specific to being reached
over HTTP by a caller whose JWT type is not already guaranteed to match, so it lives on the four
`*ForTenant` / `*ForAdmin` wrappers and not on these.

Two consumers read avatars this way rather than through a route of their own:

- `AuthService` (`me`, and the token-issuance result builder) calls `getUserAvatarUrl` so
  `avatarUrl` rides along on the authenticated-user DTO. `AuthModule` imports `MediaModule` for
  exactly this.
- `PlatformAdminDbService.findById` composes `MediaDbService.findAvatarUrl` onto the profile row,
  which is what puts `avatarUrl` on `AdminProfileResponseDto`. Since `platform_admins` no longer
  has an `avatar_url` column, "this admin's profile" is inherently two reads, and composing them
  is a DB Service's job.

There is deliberately no `GET .../avatar` route. The avatar is a field of a profile the client
already fetches, not a resource worth a round trip of its own.

This table is a summary, not the contract — see [Media Module — API
Reference](./api-reference.md) for every request/response shape and error code.

## Gap between current code and target design

**The module is implemented and shipped**, end to end: both controller pairs, `MediaService`, all
three providers, `MediaRepository` / `MediaDbService`, and `0010_media.sql` applied with
`schema.ts` regenerated. The web app drives the direct-upload step
(`apps/web/src/app/_libs/services/avatar-upload.service.ts`). Unit tests cover the service, the
Cloudinary provider, and the DB service.

What is genuinely missing or inconsistent:

- **No way to remove an avatar.** There is no delete route and no service or repository method
  behind one, so an avatar can be replaced but never cleared — an owner who uploads a picture they
  regret can only upload a different one. (`MediaRepository.deleteById` used to exist unused; it
  has since been removed, so building this means adding the repository method back alongside the
  route, the provider delete, and a decision about what the profile renders in its place.)
- **`AWS_S3_BUCKET` / `AWS_S3_REGION` sit in the same `// ─── Media ───` env block with no S3
  provider behind them.** `StorageProviderType` is `'cloudinary'`. They are leftovers
  from the boilerplate `media` module this feature replaced; either build the provider or drop the
  vars, so nobody sets them expecting an effect.
- **The `provider` column is written but never read.** `MediaService` deletes the displaced asset
  through the currently-injected provider regardless of what the row says (see
  [Replace-in-place](#replace-in-place-semantics)). Fine with one provider configured; a
  correctness bug the moment a second one exists.
- **Orphaned assets have no sweeper.** Every failure mode that is deliberately best-effort — a
  failed provider delete, an upload that is never confirmed — leaves a file in the Cloudinary
  account with nothing pointing at it and nothing that will ever notice. A periodic reconcile
  (list the folder tree, diff against `media.provider_asset_id`) is the eventual answer; today the
  only signal is the `MediaService` warning log.

Four stale or contradictory comments found while writing this document, listed so nobody trusts
them over the code:

| Where | Says | Actually |
|---|---|---|
| `CreateUploadAuthorizationInput.folder` doc comment (`types/storage-provider.type.ts`) | The folder is "not scoped per-owner, since the asset's own generated id is already unique" | It is scoped per-owner, and that scoping is the module's central security control — see [Security model](#security-model). |
| `StorageProvider.createUploadAuthorization` doc comment | "see `UploadAuthorization`'s own doc comment for why this return shape is **provider-specific**" | `UploadAuthorization` now says the opposite, and is right: the shape is deliberately provider-*agnostic* (`uploadUrl` + opaque `formFields`) so the client never branches on provider field names. |
| `StorageProvider.delete` doc comment | Cites `MediaService.replaceAvatar` | No such method; the caller is `MediaService.confirmAvatar`. |
| `0010_media.sql` header | "updates this same row **after** the application layer deletes the old provider asset" | The code deletes **after** the DB write commits, which is the safer of the two orderings and the one the service comment explains. The migration header has the sequence backwards. |

Two smaller example-level inaccuracies in the Swagger decorators, worth a sweep since they are
what a client developer reads first: both confirm routes' `ConfirmAvatarDto` example is
`avatars/a1b2c3d4-…`, a bare-root id that the folder check would actually reject — a real
`public_id` carries the owner subfolder; and `ConfirmAvatarResponseDto`'s own `@ApiPropertyOptional`
example still points at `res.cloudinary.com/demo/…/avatars/user-1.png`, the pre-owner-folder layout.
