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

**Implemented:**
- `generateForClassifiedReviews` — reads **actual** reviews
  `ReviewClassificationService` already routed to `auto_reply_candidate`/`escalated`, generates a
  reply for each, and persists it as a `pending_approval` `review_responses` row. Called from
  `ReviewSyncQueueService.classifyImportedReviews`, right after classification, in the same
  15-minute poll tick — see [§ Wired into the review-sync pipeline](#wired-into-the-review-sync-pipeline)
  below for why this is a peer step in that pipeline rather than a schedule of its own, and
  [§ What this module deliberately simplifies](#what-this-module-deliberately-simplifies)
  for the two points where it's simplified against PLAN.md §5's literal wording.

This module has no HTTP endpoints; see [AI Module — API Reference](./api-reference.md) for the error codes and the CLI script.

## Files

```
src/api/ai/
  ai.module.ts                          # AiProvider factory (AI_PROVIDER=azure by default, falls
                                         # back to 'azure' when unset; 'openrouter' also selectable)
  ai-reply-generation.service.ts        # the one entrypoint — generateForClassifiedReviews
                                         # (flat, not services/ — this module has exactly one
                                         # service; see module-structure.md's "more than one"
                                         # trigger for the services/ subfolder)
  providers/
    ai.provider.ts                      # abstract AiProvider — generateReply(input)
    azure-openai.provider.ts            # the default — AI_PROVIDER=azure, westeurope-pinned
    openrouter-ai.provider.ts           # secondary — concrete, built on the `openai` SDK
  utils/
    prompt-template.util.ts            # fillPromptTemplate (placeholder substitution),
                                         # buildSystemPrompt (fixed house-style rules)
    prompt-category-for-review.util.ts  # resolvePromptCategoryForReview — maps a classified
                                         # review to which PromptCategory drafts its reply
  constants/
    ai.constants.ts                    # model params, error codes, OpenRouter base URL,
                                         # FALLBACK_BUSINESS_NAME
    mock-review-fixtures.constant.ts    # realistic mock reviews — used by the dry-run script
  exceptions/ai.exceptions.ts
  types/
    ai-provider.type.ts                 # the provider boundary — GenerateReplyInput/Result
    ai-reply-generation.type.ts         # the service boundary — batch input/result types
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
                                 +-- AzureOpenAiProvider    (AI_PROVIDER=azure, built — the default)
                                 +-- OpenRouterAiProvider   (AI_PROVIDER=openrouter, built — secondary)
```

**`AzureOpenAiProvider` is now the default and intended production provider** —
`aiProviderFactory` in `ai.module.ts` reads `AI_PROVIDER` and falls back to `'azure'` when the env
var is unset, matching PLAN.md §5's GDPR requirement for this engagement (an Azure OpenAI resource
provisioned in `westeurope`). `OpenRouterAiProvider` remains a real, working secondary option, kept
for exactly the same DI-swap reason it was built first — neither `AiReplyGenerationService`, the
controller, nor the DTOs know or care which one is live.

Built on the same `openai` npm SDK `OpenRouterAiProvider` uses, pointed at Azure's own
chat-completions path (`{endpoint}/openai/deployments/{deployment}`, with `api-version` as a query
param and the key sent as the `api-key` header) rather than OpenRouter's `baseURL` — Azure speaks
the same chat-completions request/response shape through that SDK, so `AzureOpenAiProvider` differs
from `OpenRouterAiProvider` mainly in how the client's `baseURL`/auth are constructed, not in how a
completion is requested or parsed, exactly as this section originally predicted.

**The EU region pin is enforced, not just documented.** `getClient()` reads
`AZURE_OPENAI_REGION` and throws `AiProviderNotConfiguredException` (`MESSAGES.AI
.AZURE_REGION_INVALID`) unless it is one of `ALLOWED_AZURE_OPENAI_REGIONS`
(`src/common/constants/azure-openai.constants.ts`): `westeurope` (Netherlands, the original
requirement) and `northeurope` (Ireland, added when the client's Azure OpenAI resource was created
there). PLAN.md §5's instruction to "hardcode/validate the region at the client-config level, not
just convention" is implemented as that allow-list check, repeated in the Joi env schema so a bad
value also fails at boot, not as a comment. A region is added only with the client's agreement. The
region of a resource cannot be changed after creation, so `AZURE_OPENAI_REGION` must name the region
the resource was created in. The deployment type must be Standard or Data Zone Standard (EU): a
Global Standard deployment can process requests outside the EU.
The same method also requires `AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_API_KEY`/
`AZURE_OPENAI_DEPLOYMENT`/`AZURE_OPENAI_API_VERSION` all non-empty before constructing the client,
throwing the same exception (`MESSAGES.AI.AZURE_PROVIDER_NOT_CONFIGURED`) if any is missing.

Config is still read **lazily**, on the first real call (`getClient()`), not in the constructor or
the module factory — same reasoning as before: a missing/misconfigured value fails the first
generation attempt with a clear exception, not app startup, which matters now that generation is
genuinely wired into the live poll tick (see [Wired into the review-sync
pipeline](#wired-into-the-review-sync-pipeline) below) and a transient config problem should not
take the whole worker process down.

### Local development

There is no local stand-in for the model: drafting always calls the provider `AI_PROVIDER` selects,
so a local setup needs that provider's credentials (`OPENROUTER_API_KEY` for `openrouter`, the
`AZURE_OPENAI_*` set for `azure`), and local drafts are billed. `AI_PROVIDER` defaults to `azure`
when unset. The former `apps/mock-external-apis` emulator and `USE_LOCAL_MOCK_SERVER` were removed.

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
4. `insertGeneratedResponse` — persists one `pending_approval` row per draft (`AUTO_REPLY_SUGGESTION` or
   `ESCALATION_SNIPPET`, `source = 'ai_generated'`, `generation_metadata` carrying model/tokens/
   latency/finishReason/tone/category). Every review gets `tenant_settings.ai_reply_count` drafts (capped by
   the month's remaining AI-draft allowance) from one provider call, grouped under one `generation_group_id`
   so they are labelled A, B, C. A non-escalated review that `auto_post_enabled` will post gets one draft:
   no one picks between drafts first, so extras would only use up the allowance. `status` stays `in_review` — PLAN.md's next stage (an
   owner approving/editing/posting the draft) is what moves it further.
5. On any failure (no prompt configured, the provider call itself failing), the claim is released
   back to `'new'` so the *next* 15-minute tick retries it — the same self-healing shape a
   classification failure doesn't get (there is no "just try again" for an unclassified review;
   there is for an ungenerated one).

**A generation-phase failure never gates `markBackfillComplete`/the poll cursor**, unlike a
classification failure — see `ReviewSyncQueueService.classifyImportedReviews`'s own doc comment.
Classification already committed by the time generation runs, so the risk that gate exists to
guard against (`pending_classification` rows left behind) has already passed.

## What this module deliberately simplifies against PLAN.md §5's literal wording {#what-this-module-deliberately-simplifies}

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

## Billing entitlement check

`generateForClassifiedReviews` reads the tenant's entitlements **once per batch**, not once per review: the quota is
tenant-wide (`maxAiDraftsPerMonth` against `aiDraftsUsedThisMonth`, the count of `review_responses` with
`source = 'ai_generated'` this UTC month), so one read short-circuits the whole poll tick's generation phase. Each
persisted snippet spends one unit, so a review drafted with three snippets spends three. When the quota runs out
mid-batch the leftovers wait for the next tick (`quotaReached` in the batch result). While payments are disabled the
limits are lifted and the quota never applies.

## What a generated draft records

Every draft `AiReplyGenerationService` saves carries the **prompt version it was generated from**
(`review_responses.prompt_version_id`, from `PromptsDbService.findCurrentForCategory`) and an immutable copy of what
the model wrote (`original_content`). Both are what Settings → Prompts reads: replies are counted and rated per
version through `prompt_version_id`, and "needed edits" compares `original_content` with the final `content`.
Without them a prompt reads "No replies generated with this prompt yet" however many were generated, and the edit
rate can never rise above 0% (a missing `original_content` counts as unchanged). Drafts generated before this was
stamped have neither, so they are not counted.

## System prompt vs. template — where each instruction lives

A generated reply is driven by two separate pieces of text, composed in
`AiReplyGenerationService`/`buildSystemPrompt`:

| | Lives in | Owner-editable | Content |
|---|---|---|---|
| System prompt | `buildSystemPrompt` (fixed code) | No | Output format (no preamble/markdown/quotes), the requested tone, "never invent facts/promises", never addressing the reviewer by name or repeating a name from the review (the reviewer's name is not even sent to the provider: `{{reviewer_name}}` is filled with the neutral phrase `a reviewer`, `ANONYMOUS_REVIEWER`), and contact details: the location's Google phone and website as the only ones a reply may use, never a placeholder such as `[phone/email]`, and with none listed an invitation to get in touch that names no channel. It also holds the house style (`STYLE_RULES`): reply in the review's language (formal "Sie" for German), never repeat a member of staff's name either ("our team"), open specifically and vary the opening and closing, no corporate filler ("your feedback is important to us"), no claims that anything is being done and no vague promises, neither confirm nor dispute the complaint, a short general reply for a star-only review, speak as "we" not "I", and end an *escalated* (complaint) reply on the invitation to get in touch (the neutral template asks for an invitation to come back instead, so the rule is stated only for the `escalated` category, which `buildSystemPrompt` receives as `category`). A star-only review has no text to take a language from, so `noCommentLanguage` makes the reply use the business's language: the owner's language in the app (`users.locale`), else the app default, instead of falling back to English. |
| User prompt | The tenant's `prompt_versions.template`, filled in | Yes (Settings → Prompts) | What to acknowledge, word limits, the GDPR "don't repeat the reviewer's name" house rule (PLAN.md §6) — all already present in `DEFAULT_PROMPTS` |

`tone` is **not** a `{{placeholder}}` — it's a separate axis applied only in the system prompt,
since the required-placeholder set (`business_name`/`reviewer_name`/`rating`/`review_text`) has no
tone slot and was never meant to.

## Testing prompts and the provider

`pnpm ai:dry-run` runs the provider against **mock** reviews with the category's *default* prompt
(`DEFAULT_PROMPTS`), needing no server and no database. It shows the raw provider round-trip, latency and token
counts, and never touches a real review or persists anything. The mock reviews come from `MOCK_REVIEW_FIXTURES`
(short 5-star, mixed 3-star, angry 1-star, a long rambling 1-star, a Spanish review, a 4-star with a caveat, a star-only
review, a 1-star naming a waiter, a 1-star demanding a refund, and a German 2-star) — see that file's own doc comment
for why each one is there. The script uses whichever provider `AI_PROVIDER` selects (`createAiProvider`), so it
exercises exactly what the app would.

**Judging a prompt change.** Run the script before and after and compare the replies side by side. Model output varies
from run to run (temperature 0.7), so run each version at least twice and look for patterns rather than one reply.
What to look for: a staff or reviewer name repeated, stock filler ("your feedback is important to us"), invented
commitments ("we are working to improve"), agreeing with a complaint as fact, replying in the wrong language, "I"
instead of "we", and a complaint that does not end on the invitation to get in touch. The system prompt changes reach
every tenant immediately; the *default templates* are copied into a tenant's own prompts when the tenant is created,
so a change to `DEFAULT_PROMPTS` affects new tenants only (existing tenants keep, and can edit, their own versions).

**Lesson from tuning the style rules:** a rule that names a language ("use the formal Sie in German") made the model
answer English reviews in German, so language rules lead with "same language as the review" and give one example per
language. A bare ban on a phrase was not enough on its own: "finish a complaint with the invitation to get in touch and
add nothing after it" removed the trailing "your feedback is important to us" that bans did not.

**Star-only reviews and language.** The `{{review_text}}` placeholder for a review with no comment is an English phrase, so
"same language as the review" made every star-only review answer in English, and the default templates add "if the language is
unclear, reply in English". For these reviews `buildSystemPrompt` is given the business's language (`noCommentLanguage`) and says
the reply is written in it, whatever the instructions below say about unclear languages. The language is read once per batch, and
only when the batch holds a star-only review.
