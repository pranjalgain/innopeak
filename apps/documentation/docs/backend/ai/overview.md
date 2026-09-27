---
sidebar_position: 1
---

# AI Module

## Overview

The AI module is what actually calls a language model to draft a reply to a review — the one
piece PLAN.md §5 ("AI Generation Flow") describes that didn't exist anywhere in the codebase
before this. `prompts`/`prompt_versions` already let an owner author and version a per-category
template and tone (Settings → Prompts); `review_responses` already has every column a generated
draft needs (`source = 'ai_generated'`, `status = 'pending_approval'`, `prompt_version_id`,
`generation_metadata`); `ReviewClassificationService` already decides which category a review
belongs to. Nothing, until this module, filled a template with a real review and asked a model
for text back.

**Implemented, two ways in:**
- `generateDryRunReply` — given a tenant's prompt (real or overridden) and a **caller-supplied
  mock review**, produces reply text and shows what came back, without persisting anything. For
  validating the AI provider integration and a tenant's prompt/tone configuration in isolation.
- `generateForClassifiedReviews` — the real thing: reads **actual** reviews
  `ReviewClassificationService` already routed to `auto_reply_candidate`/`escalated`, generates a
  reply for each, and persists it as a `pending_approval` `review_responses` row. Called from
  `ReviewSyncQueueService.classifyImportedReviews`, right after classification, in the same
  15-minute poll tick — see [§ Wired into the review-sync pipeline](#wired-into-the-review-sync-pipeline)
  below for why this is a peer step in that pipeline rather than a schedule of its own, and
  [§ What this module deliberately doesn't do yet](#what-this-module-deliberately-doesnt-do-yet)
  for the two points where it's simplified against PLAN.md §5's literal wording.

For the endpoint contract, see [AI Module — API Reference](./api-reference.md).

## Files

```
src/api/ai/
  ai.module.ts                          # AiProvider factory (AI_PROVIDER=openrouter today)
  ai.controller.ts                      # POST /v1/ai/dry-run, no auth — see the API reference
  ai-reply-generation.service.ts        # the two entrypoints — generateDryRunReply and
                                         # generateForClassifiedReviews (flat, not services/ —
                                         # this module has exactly one controller and one
                                         # service; see module-structure.md's "more than one"
                                         # trigger for the services/ subfolder)
  providers/
    ai.provider.ts                      # abstract AiProvider — generateReply(input)
    openrouter-ai.provider.ts           # concrete, built on the `openai` SDK
  utils/
    prompt-template.util.ts            # fillPromptTemplate (placeholder substitution),
                                         # buildSystemPrompt (fixed house-style rules)
    prompt-category-for-review.util.ts  # resolvePromptCategoryForReview — maps a classified
                                         # review to which PromptCategory drafts its reply
  dto/
    generate-reply-dry-run.dto.ts       # request body (+ nested MockReviewDto, + toServiceInput())
    generate-reply-dry-run-response.dto.ts
  swagger/ai.swagger.ts
  constants/
    ai.constants.ts                    # model params, error codes, OpenRouter base URL,
                                         # FALLBACK_BUSINESS_NAME
    mock-review-fixtures.constant.ts    # realistic mock reviews — shared by the dry-run script
                                         # and the Swagger examples
  exceptions/ai.exceptions.ts
  types/
    ai-provider.type.ts                 # the provider boundary — GenerateReplyInput/Result
    ai-reply-generation.type.ts         # the service boundary — MockReviewInput/
                                         # GenerateDryRunReplyInput/GeneratedReply, shared with
                                         # the DTOs rather than declared twice
  scripts/
    ai-dry-run.script.ts                # `pnpm ai:dry-run` — DB-free provider smoke test
```

Also touched: `PromptsRepository`/`PromptsDbService` gained
`findByTenantAndCategory`/`findCurrentForCategory` (`src/db/repositories/prompts/`) — a lookup by
`(tenantId, category)` that didn't exist before, since every prior caller already had a specific
`prompts.id` in hand. `@prompts/constants/prompts.constants` gained `PROMPT_CATEGORIES`, the
runtime companion to the `PromptCategory` type that nothing needed until this module had to
validate a category in a request body.

`ReviewSyncRepository`/`ReviewSyncDbService` (`src/db/repositories/review-sync/`) gained
`findClassifiedNeedingGeneration`, `claimForGeneration`, `releaseGenerationClaim` and
`insertGeneratedResponse` — the generation-side counterparts to `findPendingClassification`/
`claimClassification`, on the same `reviews.status` CAS pattern. `ReviewSyncQueueService`
(`src/background/queue/review-sync/`) calls into these via `AiReplyGenerationService`, not
directly. `AiModule` now exports `AiReplyGenerationService` and is imported by
`ReviewSyncQueueModule` for exactly that call — see
[§ Wired into the review-sync pipeline](#wired-into-the-review-sync-pipeline).

## Provider abstraction — the "plug and play" part

Same DI-swap shape as `PaymentProvider`/`EmailProvider`/`StorageProvider`: business code depends
only on the abstract `AiProvider`, and `AiModule`'s factory picks the concrete implementation from
`AI_PROVIDER`.

```
AiReplyGenerationService --> AiProvider (abstract)
                                 |
                                 +-- OpenRouterAiProvider   (AI_PROVIDER=openrouter, built)
                                 +-- AzureOpenAiProvider    (AI_PROVIDER=azure, not built yet)
```

**`OpenRouterAiProvider`** uses the official `openai` npm SDK pointed at OpenRouter's own
`baseURL` (`https://openrouter.ai/api/v1`), rather than a hand-rolled `fetch` call — OpenRouter's
API is a drop-in-compatible superset of OpenAI's Chat Completions API. This is also what makes the
eventual Azure swap cheap: **Azure OpenAI speaks the same request/response shape through the same
SDK** (`AzureOpenAI` client construction, or a plain `OpenAI` client pointed at the Azure
endpoint + `api-version` query param), so `AzureOpenAiProvider` is expected to differ from
`OpenRouterAiProvider` mainly in *how the client is constructed*, not in how a completion is
requested or parsed. That shared shape — not just the `AiProvider` interface on its own — is the
actual thing making a later swap low-risk.

Config is read **lazily**, on the first real call, not in the constructor or the module factory —
deliberately unlike `StripePaymentProvider`, which validates its required config at
construction time. Nothing in the product calls this provider on any load-bearing path yet (see
below), so a missing `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` must not fail app startup the way a
misconfigured live payment provider would. Revisit this once generation is wired into the
classification pipeline and becomes load-bearing, the same way `PAYMENT_PROVIDER`'s Joi validation
in `env-config.module.ts` is currently required in production but this module's isn't.

### Adding Azure OpenAI later

Deliberately not scaffolded as an untested stub — the `AI_PROVIDER` Joi schema only allows
`'openrouter'` today, and `AiModule`'s factory has no `'azure'` case. When it's time:

1. Add `AzureOpenAiProvider` (`src/api/ai/providers/azure-openai.provider.ts`), constructed from
   `AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_API_KEY`/`AZURE_OPENAI_DEPLOYMENT`/
   `AZURE_OPENAI_API_VERSION` (reserved names, not yet wired to anything).
2. Add an `AZURE_OPENAI_REGION` check that must equal `'westeurope'`, validated at construction —
   PLAN.md §5's explicit instruction is to "hardcode/validate the region at the client-config
   level, not just convention," since Azure OpenAI availability/region is a GDPR requirement here,
   not a preference.
3. Add `'azure'` to `AI_PROVIDER`'s allowed values (`env.config.ts` + `env-config.module.ts`) and
   a matching `case` in `AiModule`'s factory.
4. Nothing in `AiReplyGenerationService`, the controller, or the DTOs needs to change — they only
   ever depend on `AiProvider`.

## Wired into the review-sync pipeline

`ReviewSyncQueueService.classifyImportedReviews` (`src/background/queue/review-sync/`) calls
`AiReplyGenerationService.generateForClassifiedReviews` right after
`ReviewClassificationService.classifyPendingReviews` succeeds, in the same job — the same 15-minute
poll tick that already imports and classifies (see the root project's own answer to "how many cron
jobs does this need": zero new ones, generation is a peer step in an existing pipeline, not a
schedule of its own).

**The claim-and-generate flow**, mirroring classification's own claim shape
(`ReviewSyncRepository.claimClassification`):

1. `findClassifiedNeedingGeneration(tenantId, locationId, limit)` — reviews already routed to
   `auto_reply_candidate`/`escalated` (by `claimClassification`) that are still `status = 'new'`
   and have no `ai_generated` draft yet. Query-driven, not fed a list from the classification call
   above it — this also catches any backlog a prior tick's generation phase failed to clear.
   **Ordered newest-first** (`reviewed_at DESC NULLS LAST`), deliberately the opposite of
   classification's oldest-first: generation is bounded by a *monthly* quota, so what it skips may
   wait weeks, and under that cap a three-day-old review matters more than a fifty-eight-day-old
   one. Oldest-first would have spent a Free tenant's entire monthly allowance on the oldest 20
   reviews of their onboarding backfill, starving every genuinely new review for the rest of the
   month. `NULLS LAST` matters on `DESC` — Postgres defaults to `NULLS FIRST`, which would sort
   reviews with no provider timestamp ahead of everything else.
2. `claimForGeneration(reviewId)` — a CAS on `status: 'new' → 'in_review'`, one row at a time.
   Closes the double-generation race the same way `claimClassification` closes
   double-classification; zero rows updated means "skip, another worker already has it."
3. Generate: resolve which `PromptCategory` this review maps to
   (`resolvePromptCategoryForReview` — a rating/classification mapping distinct from
   classification's own routing decision, see that util's own doc comment for why the two axes
   aren't the same thing), fill the tenant's real template, call the provider.
4. `insertGeneratedResponse` — persists a `pending_approval` row (`AUTO_REPLY_SUGGESTION` or
   `ESCALATION_SNIPPET`, `source = 'ai_generated'`, `generation_metadata` carrying model/tokens/
   latency/finishReason/tone/category). `status` stays `in_review` — PLAN.md's next stage (an
   owner approving/editing/posting the draft) is what moves it further.
5. On any failure (no prompt configured, the provider call itself failing), the claim is released
   back to `'new'` so the *next* 15-minute tick retries it — the same self-healing shape a
   classification failure doesn't get (there is no "just try again" for an unclassified review;
   there is for an ungenerated one).

**A generation-phase failure never gates `markBackfillComplete`/the poll cursor**, unlike a
classification failure — see `ReviewSyncQueueService.classifyImportedReviews`'s own doc comment.
Classification already committed by the time generation runs, so the risk that gate exists to
guard against (`pending_classification` rows left behind) has already passed.

## What this module deliberately simplifies against PLAN.md §5's literal wording

Both flagged here rather than silently matched — real, scoped follow-up work, not oversights:

- **No few-shot examples.** §5 asks for ~50 posted `review_responses` rows as context in the
  prompt. Not implemented — there is no reader anywhere yet of the historical replies the backfill
  already imports (`ReviewSyncQueueService`'s own `IMPORTED_REPLY_TARGET`), and adding one is a
  real, separate change (a second provider round trip's worth of context, prompt-length
  budgeting).
- **One snippet per escalated review, not 2-3.** §5 asks for 2-3 `ESCALATION_SNIPPET` rows sharing
  one `generation_group_id` per escalated review, for an owner to pick from. This generates
  exactly one — but still assigns a real `generation_group_id`, so the schema already means the
  same thing it will once the real multi-snippet version lands (a group of one is a valid group);
  only the loop that would call the provider 2-3 times is deferred.
- **No retry/backoff on the provider call itself.** A failed generation call releases its claim
  for the next tick to retry, which is a coarser recovery than an in-request retry with backoff.

## Billing entitlement check, everywhere generation can run

`BillingEntitlementsService.canGenerateAiDraft` existed before this module (added alongside the
billing feature, deliberately unwired — see that method's own doc comment) and counts
`review_responses` rows with `source = 'ai_generated'` in the current calendar month. Both
`generateDryRunReply` and `generateForClassifiedReviews` call it before generating, and it throws
`AiDraftLimitReachedException` (already defined in `billing.exceptions.ts`) — but only the second
one can ever move the count it enforces, since a dry run never persists a row. `generateDryRunReply`
still checks it anyway: enforcing the check there costs nothing (it can never itself push a tenant
over the limit) while still letting you verify the whole entitlement wiring works, not just the AI
call in isolation. `generateForClassifiedReviews` checks it **once per batch**, not once per review
— the quota is tenant-wide, so a single check short-circuits the whole poll tick's generation phase
rather than re-checking (and re-reading the same count) for every candidate.

## System prompt vs. template — where each instruction lives

A generated reply is driven by two separate pieces of text, composed in
`AiReplyGenerationService`/`buildSystemPrompt`:

| | Lives in | Owner-editable | Content |
|---|---|---|---|
| System prompt | `buildSystemPrompt` (fixed code) | No | Output format (no preamble/markdown/quotes), the requested tone, "never invent facts/promises" |
| User prompt | The tenant's `prompt_versions.template`, filled in | Yes (Settings → Prompts) | What to acknowledge, word limits, the GDPR "don't repeat the reviewer's name" house rule (PLAN.md §6) — all already present in `DEFAULT_PROMPTS` |

`tone` is **not** a `{{placeholder}}` — it's a separate axis applied only in the system prompt,
since the required-placeholder set (`business_name`/`reviewer_name`/`rating`/`review_text`) has no
tone slot and was never meant to.

## Testing the dry-run path

Two ways to exercise it, deliberately different in scope — both against **mock** reviews, neither
touching a real review or persisting anything:

| | `pnpm ai:dry-run` | `POST /v1/ai/dry-run` |
|---|---|---|
| Needs a running server | No | Yes |
| Auth | N/A (no server) | None — `@Public()`, see `AiController`'s own doc comment |
| Uses which template | Category's *default* (`DEFAULT_PROMPTS`) | The **real tenant's own saved** template/tone (pass `tenantId`, or omit for the newest tenant), or an override |
| Checks | Raw provider round-trip, latency, token counts | The whole path: entitlement check, prompt lookup, business name resolution, provider call |

Both draw their mock reviews from the same `MOCK_REVIEW_FIXTURES` list (short 5-star, mixed
3-star, angry 1-star, a long rambling 1-star, and a non-English review) — see that file's own
doc comment for why each one is there.
