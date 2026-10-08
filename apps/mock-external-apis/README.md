# mock-external-apis

A standalone local emulator for external services the backend can't reach yet with real
credentials:

- **Azure OpenAI** chat-completions (`POST /azure-openai/deployments/:deployment/chat/completions`)
- **Google Business Profile** reply read/write (`GET`/`PUT .../reviews/:reviewId[/reply]`)
- **Microsoft identity platform** (Entra ID sign-in) under `/microsoft/common/...`

Nothing in `apps/backend` talks to this server unless `USE_LOCAL_MOCK_SERVER=true` — see
`apps/backend/src/common/helpers/local-mock-server.util.ts` and that env var's own doc comment in
`env.config.ts`. This is a dev-only tool; it is never reachable in production (the backend's own
Joi schema forbids `USE_LOCAL_MOCK_SERVER` outside non-production environments).

## Running

```bash
pnpm --filter mock-external-apis dev
```

Starts on `http://localhost:4100` by default (override with `PORT`).

## Testing the GBP freshness-check / supersede path locally

The GBP side is stateful (in-memory, keyed by review id) specifically so the real
freshness-check-then-post round trip is exercisable end to end:

- `POST /gbp/__seed-external-reply` `{ reviewId, comment }` — pre-seeds a review as "already
  replied to on Google," reproducing the PLAN.md §8.12 scenario (someone replies directly on
  Google while our own draft is still pending) without a real GBP account.
- `POST /gbp/__force-failure` — makes the *next* `PUT .../reply` call return a 500, for exercising
  `post_failed` + `retry-post`.
- `POST /gbp/__reset` — clears all seeded/posted state.
- `DELETE /gbp/__reply/:reviewId` — clears one review's state.

None of the `__*` debug routes exist on the real Google API — they're local-only test hooks.

## Microsoft sign-in emulation

Set `MICROSOFT_AUTHORITY=http://localhost:4100/microsoft/common` (with any non-empty
`MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`, and `DEV_MICROSOFT_AUTH_MOCK` unset) and the
backend's **real** `MicrosoftOidcProvider` runs against this server: authorize page → code → token
exchange → an ID token that is genuinely RS256-signed with a key generated at startup and published at
`/microsoft/common/discovery/v2.0/keys`, so signature, issuer, audience, nonce and PKCE checks all
execute for real.

The sign-in page lets you pick the email and name, and whether to emit `xms_edov` (Microsoft vouching
for the email's domain). Leave it ticked for a normal sign-in; untick it to see the
`EMAIL_NOT_VERIFIED` refusal. The same email always gets the same `sub`. `outlook.com`/`hotmail.com`/
`live.com`/`msn.com` addresses get Microsoft's personal-account tenant id; other domains get a stable
per-domain tenant id.

Like the real service, a `code` is single-use and must be redeemed with the same `redirect_uri`, and
the PKCE `code_verifier` must hash to the challenge. `POST /microsoft/__reset` drops any unredeemed codes.

## Azure OpenAI emulation

By the time a request reaches this server, the backend's real `fillPromptTemplate` has already
substituted the review's actual rating/reviewer/text into the prompt — there's nothing left to
"fill." This server reads those values back out of the prompt text and composes a reply that
visibly reacts to them (acknowledging the star rating, quoting a short excerpt), so dry-run output
and escalation snippets look like real responses rather than one fixed canned string.
