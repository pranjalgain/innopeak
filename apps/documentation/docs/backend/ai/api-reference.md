---
sidebar_position: 2
---

# AI Module — API Reference

## No HTTP routes

The AI module exposes **no HTTP endpoints**. It once had `POST /v1/ai/dry-run` (generate a reply for a caller-supplied
mock review); that route was removed because nothing in the product called it and every call was a billable provider
request. Reply drafting now happens only inside the review-sync worker
(`AiReplyGenerationService.generateForClassifiedReviews`, see [AI Module — Overview](./overview.md)), and the drafts it
produces reach users through the [Reviews API](../reviews/api-reference.md) as ordinary `pending_approval` responses.

To try the provider or a prompt without a running server, use the CLI script:

```bash
pnpm ai:dry-run
```

It is DB-free, uses the default prompts and the shared mock review fixtures, and talks straight to the configured
provider (`src/api/ai/scripts/ai-dry-run.script.ts`).

## Error codes

These are raised by the generation worker, not returned over HTTP. They show up in worker logs and, where a draft could
not be produced, in the review's generation state.

| Code | When |
|---|---|
| `AI_PROMPT_NOT_CONFIGURED` | No `prompts` row exists for the tenant and category. Should never fire in practice: every tenant is seeded with all three categories at signup (`PromptsDbService.insertDefaultsForTenant`) |
| `AI_PROVIDER_NOT_CONFIGURED` | The selected provider's settings are unset (`OPENROUTER_API_KEY`/`OPENROUTER_MODEL`, or the `AZURE_OPENAI_*` settings). Checked lazily on the first call, not at boot |
| `AI_GENERATION_FAILED` | The provider call failed (network error, non-2xx, or a completion with no message content) |
