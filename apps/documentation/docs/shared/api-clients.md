---
sidebar_position: 2
---

# Shared API Clients

## Overview

`libs/client_sdk` is a typed TypeScript client for the backend's v1 API, generated from its
OpenAPI spec by [openapi-generator](https://openapi-generator.tech/) (`typescript-axios`). It is
published into the workspace as `@innopeak/client-sdk` and consumed by `apps/web`.

It replaced a hand-written `ApiClient` that built URLs and parsed responses by hand. The
motivation was drift: request shapes, query parameters and response fields were re-declared in the
frontend and could disagree with the backend silently, surfacing as a runtime `undefined` rather
than a build error. Generating the client makes the backend's DTOs the single source of truth.

## Layout

| Path | Purpose |
|---|---|
| `libs/client_sdk/` | Generated output. Never hand-edit — see [Regenerating](#regenerating). |
| `apps/web/src/app/_libs/api-sdk/config.ts` | Shared axios configuration and the auth interceptors. |
| `apps/web/src/app/_libs/api-sdk/*-api.ts` | One thin binding per generated API class. |
| `apps/web/src/app/_libs/services/*.service.ts` | Domain services that call the SDK and map to app types. |
| `apps/web/src/app/_libs/services/api-error.ts` | `ApiError` plus the `unwrap()` envelope helper. |

Components and hooks never call the SDK directly — they go through the service layer, which owns
the mapping between wire DTOs and the app's own domain types in `apps/web/src/types/domain.ts`.

## Usage

Each generated API class gets one binding that shares the common `apiConfig`:

```ts
// apps/web/src/app/_libs/api-sdk/reviews-api.ts
import { ReviewsApi } from "@innopeak/client-sdk";

import { apiConfig } from "@/app/_libs/api-sdk/config";

export const reviewsApi = new ReviewsApi(apiConfig);
```

A service then calls it and unwraps the response:

```ts
const response = await reviewsApi.reviewsControllerListReviewsV1({ page, pageSize });
const page = unwrap<ApiReviewList>(response.data);
```

### Method signatures

The generator runs with `useSingleRequestParameter: true`, so every public method takes **one**
`requestParameters` object, plus a **separate** trailing `options?: RawAxiosRequestConfig`:

```ts
// Correct — two arguments.
connectionsSyncApi.connectionsSyncControllerGetBackfillV1({ locationId }, { signal });

// Wrong — `signal` is not a request parameter, so it is silently dropped
// and the request can never be aborted.
connectionsSyncApi.connectionsSyncControllerGetBackfillV1({ locationId, signal });
```

Check the generated class in `libs/client_sdk/api/*.ts` when in doubt; the second form compiles.

### The response envelope

`TransformInterceptor` wraps every backend response in `ApiResponse<T>`
(`{ statusCode, status, message, data }`). The OpenAPI schema documents the **inner** DTO as the
response type, so the SDK's declared return type is one level shallower than reality: at runtime
axios's `response.data` is the envelope, and the payload is `response.data.data`.

`unwrap<T>()` bridges that gap and is required at every call site:

```ts
const metrics = unwrap<MetricsDto>(response.data);
```

Because the generated types cannot express this, `unwrap` takes the payload type as a generic —
it is an assertion, not a checked conversion. Passing the wrong type argument compiles and fails
at runtime, so keep it matched to the endpoint's real DTO.

### Authentication

`config.ts` installs one pair of interceptors on the global axios instance at import time. Every
generated class falls back to that instance, so a single pair covers all SDK calls.

The request interceptor attaches the stored access token as a `Bearer` header. The response
interceptor turns failures into `ApiError` and, on a `401`, refreshes the token once and replays
the request.

Two custom per-request flags control that behaviour, added to `AxiosRequestConfig` by module
augmentation:

- `authOptional` — do not attach a token. For public routes: login, signup, refresh itself.
- `skipRefresh` — never attempt refresh-and-retry on a `401` from this request.

```ts
await authApi.authControllerLoginV1({ loginDto }, { authOptional: true });
```

Both matter for correctness, not just efficiency. A `401` from login means *wrong password*, and
a `401` from change-password means *wrong current password* — neither means "expired token". Left
unflagged, those responses would trigger a token refresh and a silent retry of the failed request.

Refreshes are single-flight: concurrent `401`s share one rotation, because the backend's refresh
tokens are single-use. A failed refresh is retried once before the session is cleared, since a
refresh that lost a race against another tab is answered with a `401` that is deliberately
indistinguishable from a dead session's. See `apps/web/src/app/_libs/api-sdk/test/config.test.ts`.

## Regenerating

```bash
pnpm start:dev       # in apps/backend — the script reads the live spec
pnpm generate:sdk    # from the repo root
```

The generated output **is committed**, so `apps/web` type-checks and builds without a running
backend. Regeneration is therefore a reviewable commit, and `generate:client` begins with
`rm -rf libs/client_sdk` — any hand-edit is destroyed on the next run.

Full generator configuration and post-processing steps live in `apps/backend/README.md`, under
"Client SDK Generation".

### Two constraints worth knowing

**A new module must be added to the Swagger allowlist.** `V1_MODULES` in
`apps/backend/src/bootstrap.ts` is an allowlist passed to `SwaggerModule.createDocument`. A module
missing from it serves its routes normally but never appears in the spec — so it silently never
appears in the SDK either. Nothing fails loudly.

**Nullable DTO properties need an explicit `type`.** `@ApiPropertyOptional({ nullable: true })`
without one generates as `object | null` rather than the real type, forcing type assertions in
the frontend for fields the backend already knows the shape of:

```ts
@ApiPropertyOptional({ example: 4.3, type: Number, nullable: true })
avgRating!: number | null;
```

The same applies to index-signature shapes, which need `additionalProperties`:

```ts
@ApiProperty({ example: { "5": 96 }, additionalProperties: { type: 'integer' } })
distribution!: Record<number, number>;
```

## Dependencies

`axios`, pinned to an exact version by `apps/backend/scripts/postprocess-sdk.ts`. That pin must
match `apps/web`'s axios version or TypeScript's module augmentation breaks — the reasoning is in
`apps/backend/README.md`, under "The axios version pin is load-bearing".
