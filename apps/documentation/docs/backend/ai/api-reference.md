---
sidebar_position: 2
---

# AI Module — API Reference

## How to read this document

This describes the AI module **as it is actually implemented** — `src/api/ai/ai.controller.ts`,
`ai-reply-generation.service.ts`, the `dto/` classes it accepts/returns, and
`exceptions/ai.exceptions.ts`. Nothing here is a pre-implementation target design.

It assumes you have read [AI Module — Overview](./overview.md) for the provider abstraction, the
system-prompt/template split, and — most importantly — what this module does **not** do yet (no
classification-pipeline wiring, no persistence). This one route is a testing/validation tool, not
the AI-reply feature end users will eventually see.

## Conventions

- **Base path**: `/v1/ai/...` — `RouteNames.AI` (`'ai'`), `version: '1'`.
- **Auth column**: `@Public()` — no token required, removed on request for local testing without
  first logging in. Since there is no token to read a `tenantId` off, the request body carries an
  optional `tenantId` instead (see below); omitted, the controller falls back to the newest
  tenant. This is a materially different trust posture from every other route in this codebase —
  see the controller's own doc comment for why it's still acceptable here (a dry run reads
  configuration and spends money, but never writes anything).
- **Throttle**: `@Throttle({ short: { limit: 5, ttl: 60000 } })` — tighter than this codebase's
  usual 10/min write-route override, since every call here is a real provider request, not a
  database write.
- **Envelopes / timestamps / ids**: see the [Auth Module — API Reference §
  Conventions](../auth/api-reference.md#conventions) for the shared envelope shapes. This route
  returns no ids or timestamps of its own — nothing it produces is persisted.

## `POST /v1/ai/dry-run`

Fills a prompt template with a caller-supplied mock review and calls the configured AI provider.
Never writes to `review_responses` — see the overview's
[§ What this module deliberately doesn't do yet](./overview.md#what-this-module-deliberately-doesnt-do-yet).

Request body:

```json
{
  "category": "positive",
  "review": {
    "reviewerName": "Jamie L.",
    "rating": 5,
    "reviewText": "Amazing coffee and the staff remembered my order from last time! Will definitely be back."
  }
}
```

| Field | Type | Rules |
|---|---|---|
| `tenantId` | string (uuid), optional | Whose saved prompts/tone to use. Omitted, falls back to the newest tenant (`AdminBusinessesDbService.findAll()[0]`) — convenient on a single-tenant dev database, meaningless once there's more than one |
| `category` | enum | `positive` \| `neutral` \| `escalated` (`PROMPT_CATEGORIES`) — which of the tenant's three prompts to use |
| `review.reviewerName` | string | 1-255 chars |
| `review.rating` | integer | 1-5 |
| `review.reviewText` | string | 1-5000 chars |
| `toneOverride` | enum, optional | One of `PROMPT_TONES`. Overrides the tenant's saved tone for this call only — `prompts.tone` is never written |
| `templateOverride` | string, optional | Test template text that hasn't been saved as a real prompt version. Sanitized the same way `PromptsService.createVersion` sanitizes a saved one, but **not** checked for required `{{placeholders}}` — a dry run may deliberately omit one to see what the model does without it |

`category`/`review` are always required. `toneOverride`/`templateOverride` are independent of each
other: passing `templateOverride` alone uses the tenant's saved tone (or `professional` if
somehow unset); passing `toneOverride` alone uses the tenant's saved template.

Success `200`:

```json
{
  "content": "Thank you so much for the kind words, Jamie — we're thrilled you enjoyed the coffee and glad the team could make your visit feel personal. See you again soon!",
  "model": "nvidia/nemotron-3-super-120b-a12b:free",
  "promptTokens": 142,
  "completionTokens": 38,
  "latencyMs": 1204,
  "finishReason": "stop",
  "category": "positive",
  "tone": "professional",
  "usedTemplateOverride": false
}
```

| Field | Type | Rules |
|---|---|---|
| `content` | string | The generated reply, trimmed |
| `model` | string | The model that actually served the request — OpenRouter can route to a different underlying model than requested (e.g. a `:free` variant rerouted under load) |
| `promptTokens` / `completionTokens` | integer \| null | `null` when the provider's response omitted usage accounting |
| `latencyMs` | integer | The provider call alone, not including this route's own DB reads. The SDK's own retries are disabled (`AI_MAX_RETRIES = 0`) specifically so this number reflects one real attempt |
| `finishReason` | string \| null | Why the model stopped. Only `stop` means the reply is complete; `length` means it was cut off at `AI_MAX_OUTPUT_TOKENS` and is **not** a usable draft. Worth checking on every free-tier model — several of OpenRouter's spend the whole budget on reasoning tokens before reaching an answer |
| `category` | enum | Echoes the request |
| `tone` | enum | The tone actually used — `toneOverride` if given, else the tenant's saved tone |
| `usedTemplateOverride` | boolean | Whether `templateOverride` was used instead of the tenant's saved template |

## Error reference

| Status | Code | When |
|---|---|---|
| `403` | `AI_DRAFT_LIMIT_REACHED` | The tenant's plan-level monthly AI-draft limit is already reached (`BillingEntitlementsService.canGenerateAiDraft`) — checked even though this specific route never persists a row (the real generation path does; this dry-run route just shares the same check), see the overview's [§ Billing entitlement check](./overview.md#billing-entitlement-check-everywhere-generation-can-run) |
| `404` | `AI_PROMPT_NOT_CONFIGURED` | No `prompts` row exists for this tenant + `category`. Should never fire in practice — every tenant is seeded with all three categories at signup (`PromptsDbService.insertDefaultsForTenant`) |
| `404` | `AI_DRY_RUN_NO_TENANT` | `tenantId` was omitted and no tenant exists at all in the database |
| `404` | `SUBSCRIPTION_NOT_FOUND` / `PLAN_NOT_FOUND` | Not this module's own code — `canGenerateAiDraft`'s own `getEntitlements` call throws these (see [Billing § Error reference](../billing/api-reference.md#error-reference)) if the tenant's `tenant_subscriptions`/`billing_plans` rows are missing. Same "should never happen" data-integrity gap as every other `BillingEntitlementsService` caller; surfaced here because this route is that method's first caller outside the billing module itself |
| `503` | `AI_PROVIDER_NOT_CONFIGURED` | `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` unset — checked lazily on this call, not at boot. See the overview's own note on why this isn't required at startup yet |
| `502` | `AI_GENERATION_FAILED` | The provider call itself failed (network error, non-2xx, or a completion with no message content) |
| `400` | `Validation Error` | A malformed `category`/`toneOverride`/`tenantId`, or a `review`/`templateOverride` field violating its length/type rule. `message` is the comma-joined list of violations |
| `429` | `Too Many Requests` | This route's own 5/min override exceeded |
| `500` | `Internal Server Error` | Unhandled exception. Only `traceId` is safe to surface |
