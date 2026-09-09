---
sidebar_position: 5
---

# Multilingual Support (English + German)

## Overview

This document is the design spec for making the product bilingual — English and German — across
every surface a human reads: the web app, the API's own messages, the emails it sends, the
AI-generated review replies, and the developer documentation site. It is written before the
implementation, per the "Docs first" rule in the root `CLAUDE.md`, and is the thing to argue with
before any code lands.

**Scope, as confirmed:**

| Decision | Value |
|---|---|
| Locales | `en` (default) and `de`. Exactly two — not a locale framework with one locale plugged in. |
| Preference storage | `users.locale`, falling back to the request's `Accept-Language`, falling back to `en`. |
| Surfaces | Web UI, backend messages + emails, AI review replies, Docusaurus docs site. |

**Not in scope:** any third locale, right-to-left layout (neither `en` nor `de` needs it, and
building for it unused is how it rots), per-tenant locale defaults, cleaning up or re-fetching
Google's machine-translated review text (kept exactly as-is — see
[Review text and reply language](#review-text-and-reply-language)), and translating the 30
engineering documents on the docs site (see [Documentation site](#documentation-site) for what
"multilingual docs" means here instead).

`PLAN.md` — the product spec everything else in `docs/backend/` traces back to — contains **no
mention of language, locale, i18n or translation**. This feature has no upstream spec section to
implement against, so the decisions recorded here are the spec.

## Review text and reply language

**Confirmed: this branch does not touch ingestion.** `reviews.review_text` stays exactly as GBP
returns it today — no `Accept-Language` header change, no marker-stripping, no migration over
existing rows. Reply language is decided at generation time, by the prompt, not by cleaning the
stored text.

**Yes — the prompt is the mechanism for this, and it needs no other infrastructure.** The
generation call (once the generation module exists — see [AI review replies](#ai-review-replies))
passes the review text to the model with a system instruction along these lines:

> Detect whether the review below is written in English or German. Write your reply in the same
> language. If it is written in a different language, reply in English.

This needs no `reviews.language` column, no separate detection library, and no ingestion change —
the model already reads the review text to write the reply, so language detection is free at that
point. It also generalizes better than a stored column would: a review in a third language still
gets a sensible reply (English, per the fallback line) instead of an undefined case.

**One caveat worth knowing, not fixing here.** Google's Business Profile API can return review text
as a machine-translated/original mashup — see the box below. For those rows, `review_text` contains
*both* languages in one string, so a model told to "detect the language and reply in kind" is
reading a mixed string. The generation prompt's own wording needs to account for this once it is
written — e.g. prefer the `(Original)` portion when present, since that is the reviewer's actual
words, not Google's translation of them. This is a direct, known consequence of leaving ingestion
untouched; it is not blocking, just something the prompt has to be worded around.

### Background: what the mashup looks like, and one thing it's already breaking

`GoogleBusinessProfileProvider.listReviews` sends no `Accept-Language` header
(`google-business-profile.provider.ts:182`), so for a review not in the language Google infers for
the account, the API returns both versions concatenated in one `comment` string:

```text
(Translated by Google) Great service, very friendly staff.

(Original) Toller Service, sehr freundliches Personal.
```

This is undocumented behaviour — Google's own
[reviews.list reference](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list)
and [review data guide](https://developers.google.com/my-business/content/review-data) don't
mention it — the halves can arrive in either order, and the marker text itself localizes with
whatever `Accept-Language` is sent. None of that is being relied on or fixed in this branch; it's
recorded here because it explains the caveat above, and because of one separate finding worth
flagging even though it is out of scope:

**Blocklist classification is already matching against this mashup on `development` today.**
`findMatchedKeywords` does a case-insensitive substring match of the tenant's blocklist terms
against `review.reviewText` (`review-classification.rule.ts:55`) with no awareness of the markers.
A German tenant's German terms only match the `(Original)` half; English terms can false-positive
against Google's own machine translation of a review that never used that word. This predates this
branch, is not part of the confirmed scope, and is not being changed here — noted so it isn't
mistaken for something this work already addresses.

## The locale contract

One canonical definition, shared by all three apps, so "de" cannot mean `de`, `de-DE` and `German`
in three places:

- Tags are the bare BCP-47 language subtags **`en`** and **`de`**. No region subtags — there is no
  `de-AT`/`de-CH` differentiation in scope, and admitting region tags now means every comparison
  has to normalise them.
- `en` is the default and the fallback. A missing German string renders English rather than a key
  name or an empty node.
- A backend enum (`Locale`) and a Postgres enum (`locale`) are the source of truth; the web app's
  locale list and the Docusaurus `locales` array must match them. A test asserts the sets are equal
  so they cannot drift silently.

### Resolution order

Every surface resolves in this order, first hit wins:

| # | Source | Applies to |
|---|---|---|
| 1 | `users.locale`, when the user is authenticated and has set one | Web app, API responses, emails, background jobs |
| 2 | `Accept-Language` on the request, negotiated against `['en','de']` | Web app and API for anonymous traffic (login, signup, marketing) |
| 3 | `en` | Everything else, including any background job whose user has no locale |

Step 1 is why a column is needed and header negotiation alone is not enough: an email sent from a
BullMQ job — a notification about a new review, say — has no HTTP request to read a header from.
The locale has to be durable and readable from the database, or background-sent mail is
permanently English.

## Backend

### Schema

One column, added by **editing the original migration in place** — this repo does not ship
forward `ALTER` migrations, it recreates local databases (`apps/backend/CLAUDE.md`, "Schema changes
are edited into the original migration file"):

| Table | Column | Migration file | Notes |
|---|---|---|---|
| `users` | `locale locale` (nullable) | `0002_tenant_auth.sql` | Nullable, **not** `DEFAULT 'en'`. Null means "never chose", which is what makes `Accept-Language` negotiation legitimate for that user; a default of `en` would pin every existing user to English and make the header unreachable. |

No column is added to `reviews` — reply language is a prompt-time concern, not a stored one. See
[Review text and reply language](#review-text-and-reply-language).

### Message localization: translate at the edge, not at the throw site

`src/common/constants/messages.constants.ts` currently holds 93 lines of literal English, mixing
plain strings with interpolating functions:

```ts
SIGNUP_OTP_SENT: (email: string): string => `Verification code sent to ${email}`,
INVALID_CREDENTIALS: 'Invalid email or password.',
```

Every controller and service references these statically (`MESSAGES.AUTH.INVALID_CREDENTIALS`),
which means there is no request context at the point of use. The naive fix — make the messages
object request-scoped and inject it everywhere — would touch every service in the codebase and
make a large number of currently-pure classes request-scoped.

**Recommended approach: services keep throwing and returning stable message *keys*, and exactly
one layer translates.** The global exception filter and the response transform interceptor both
already sit at the request edge and both already see every outgoing message; they are where the
resolved locale is available and where a key becomes a sentence. Concretely:

- `MESSAGES` becomes a map of keys to *message descriptors*, not English strings.
- `messages.en.ts` and `messages.de.ts` each provide the full set, typed so that a missing or
  extra German key is a **compile error** rather than a runtime fallback. With this project's
  strictness settings that is cheap to enforce and worth more than a runtime `t()` that silently
  returns the key.
- Interpolating messages stay functions with the same signature in both files.
- The filter/interceptor resolve the locale once per request and render.

This keeps localization out of business logic entirely, needs no new dependency (`nestjs-i18n`
brings its own module lifecycle, its own file format and its own runtime key-miss behaviour, none
of which improve on a typed two-file map for exactly two locales), and gives background jobs the
same renderer with an explicit locale argument instead of an ambient request.

### A trap worth naming: the anti-enumeration messages must stay identical

Several messages in `messages.constants.ts` are *deliberately* identical to each other, with
comments saying so, because differing text would leak account existence:

- `INVALID_CREDENTIALS` — the same for a wrong password, an unknown email, and an SSO-only account.
- `INVALID_OR_EXPIRED_OTP` — the same whether the code never existed, was used, or expired.
- `SIGNUP_OTP_SENT` / `LOGIN_OTP_SENT` — identical strings.
- `RESEND_OTP_ACK` — phrased to avoid confirming the account is awaiting verification.

A translator working from a spreadsheet has no way to know this, and German synonyms are an easy
place to accidentally reintroduce the oracle ("Passwort falsch" vs. "Konto nicht gefunden"). The
implementation must carry a test that asserts the pairs which are equal in English remain equal in
German, so the property is enforced by CI rather than by a comment a translator never reads.

### Emails

`EmailService.sendTemplateEmail(to, templateName, data, overrides)` compiles
`templates/<name>.hbs`. Localizing means `templates/<locale>/<name>.hbs` for the four existing
templates (`welcome`, `mfa-code`, `reset-password`, `notification`).

Three specifics found in the survey:

- **The template cache is keyed on `templateName` alone** (`this.templateCache.get(templateName)`).
  Adding a locale dimension without changing the cache key means the first locale to warm the cache
  serves every subsequent request in the wrong language. The key must become `${locale}/${name}`.
- **`deriveSubject` builds the subject from the template *filename*** when no override is passed.
  Subjects are user-facing, so they localize too — they belong in the message catalogue above, not
  derived from a filename.
- **The asset pipeline already handles the new directory.** `nest-cli.json` copies
  `email/templates/**/*.hbs`, a recursive glob, so `templates/de/welcome.hbs` is picked up with no
  build change. Verified rather than assumed, because a missed asset copy fails only in the
  compiled build and not in dev.

Callers must pass a locale. For request-driven mail (signup OTP) it is the resolved request locale;
for job-driven mail it is the recipient's `users.locale`, read from the database.

## Web app

The web app is **further along than expected**: `next-intl` is installed, wired through
`next.config.ts`, and `NextIntlClientProvider` already wraps the tree in
`src/app/layout.tsx`. All UI copy is already
extracted into `messages/en.json` — 807 lines across 20 namespaces. The extraction work, normally
the bulk of retrofitting i18n, is done.

What is missing is exactly the locale plumbing, and `src/i18n/request.ts`
says so in its own comment: single locale hardcoded, no `[locale]` route segment, no middleware,
"add locale detection here if/when a second locale is actually needed."

So the work is:

- Resolve the locale in `request.ts` instead of returning the literal `"en"` — from a cookie, then
  the authenticated user's `locale`, then `Accept-Language`.
- `messages/de.json` mirroring all 20 namespaces, with a test asserting key-set equality against
  `en.json` (the same completeness argument as the backend catalogue).
- `<html lang="en">` in the root layout becomes the resolved locale. It is currently hardcoded, and
  a wrong `lang` attribute is what breaks screen readers and browser translation prompts.
- A locale switcher, and persistence of the choice — writing it to `users.locale` via the API when
  authenticated, and to a cookie otherwise.

### The one decision that is expensive to reverse

Whether German gets its own URL prefix (`/de/dashboard`) or the locale lives only in a cookie and
every URL stays as it is today.

|  | Cookie-only (no URL segment) | `[locale]` route segment |
|---|---|---|
| Churn | None. No files move. | Every route moves into `src/app/[locale]/`, and `typedRoutes: true` means every internal `Route`-typed link is re-typed. |
| SEO | German marketing page is not separately indexable. | German marketing page gets its own indexable URL, `hreflang`, and canonical. |
| Shareability | A link opens in the recipient's locale, not the sender's. | A link carries its language. |
| Fit | Good for the authenticated app — it is behind login, nothing to index. | Necessary for public pages if German organic traffic matters. |

The app is overwhelmingly an authenticated dashboard: `(dashboard)`, `(auth)` and `admin` route
groups have no SEO stake at all. But there **is** a real public marketing landing page at
`(public)/page.tsx` with full metadata — canonical URL, OpenGraph, Twitter card — so German SEO is
not a purely theoretical concern.

**Recommendation: cookie-only, for the whole app, in this branch.** It delivers a fully bilingual
product with no structural churn, and it keeps `typedRoutes` intact. If German organic search
matters commercially, the right follow-up is a `[locale]` prefix for the `(public)` group *only* —
which is a contained change — rather than paying for URL-prefixing the dashboard that will never be
indexed. This is flagged rather than assumed because reversing it later costs the route move that
choosing it now would avoid.

**One cost of that choice, missing from the first draft of this section and added after review.**
`src/i18n/request.ts` resolves the locale with `cookies()` and `headers()`, both Next.js dynamic
APIs, and it is reached from the root layout — so every route in the app now renders per request.
The dashboard doesn't care (it was always per-user and dynamic anyway), but the public marketing
page loses static generation and the full-route cache, and is server-rendered on every visit where
it previously shipped as prebuilt HTML. That is a genuine regression for the one page with an SEO
and cold-load stake, and it makes the `(public)`-only `[locale]` follow-up above meaningfully more
attractive than "only if organic search matters" implied: a locale segment there would let that
page be statically rendered per locale while the authenticated app keeps the cookie. Accepted
knowingly for this branch; recorded here so the follow-up is argued on the real tradeoff rather
than on the earlier claim that a URL segment "buys nothing".

## AI review replies

The goal is that a German reviewer gets a German reply. The constraint is that **the generation
module does not exist yet** — `src/review-pipeline/` contains classification only, and `PLAN.md`'s
generation stage is unbuilt. There is no model call in the codebase to make locale-aware.

Language matching is entirely a prompt concern — see
[Review text and reply language](#review-text-and-reply-language) above for the mechanism (a
detect-and-reply-in-kind instruction in the generation call) and its one caveat. There is no schema
change here: no `reviews.language` column, no detection step outside the model call itself.

What *is* worth deciding now, so generation is not designed twice, is where that instruction lives
relative to the tenant's own editable prompt. `prompts` today is `UNIQUE (tenant_id, category)` —
one prompt per tenant per category:

- *Per-locale prompt rows* would mean `UNIQUE (tenant_id, category, locale)`, an owner-facing
  Settings → Prompts screen that multiplies by locale, and a tenant having to write and maintain
  German prompt text.
- *Language-agnostic prompt, language instruction injected at generation* keeps one prompt per
  category; the system wraps it with the detect-and-reply-in-kind instruction, which the tenant
  never sees or edits.

**Recommendation: language-agnostic prompt.** It needs no schema change to `prompts`, no
multiplication of the owner's editing surface, and it handles reviews in any language, not just the
two the UI speaks — a review in a third language still gets a sensible (English, per the fallback)
reply instead of an undefined case. The tone/category selection stays orthogonal to language, which
is what it should be.

## Documentation site

`apps/documentation` already has the i18n block, set to `locales: ['en']`. Adding `'de'` is a
one-line change plus an `i18n/de/` tree.

The honest scoping point: `docs/` holds 30 markdown files of dense internal engineering prose —
the review-pipeline overview alone runs to hundreds of lines of design rationale that changes with
every branch. Translating that into German would be a large effort, would go stale immediately, and
serves an audience (this development team) that reads English.

Docusaurus makes the useful subset cheap, because **untranslated markdown falls back to the default
locale** — a missing German page renders the English content rather than 404ing. So "multilingual
docs" here means:

- `locales: ['en', 'de']` and a locale dropdown.
- `i18n/de/code.json` — the theme chrome: navbar, sidebar labels, "Next"/"Previous", search
  placeholder. Small, stable, genuinely worth translating.
- Document bodies stay English and fall back, until and unless someone decides a specific page has
  a German-reading audience.

This is stated explicitly so that "the docs site supports German" is not later read as a claim that
the documentation *is* in German.

## Verification

- `pnpm type-check`, `pnpm lint`, `pnpm test` across the backend; the web app's own checks.
- Key-completeness tests: `messages.de.ts` against `messages.en.ts`, `de.json` against `en.json`,
  and the backend/web/Docusaurus locale lists against each other.
- The anti-enumeration equality test described above.
- Email: render all four templates in both locales and assert the cache returns the right language
  for a second request in the other locale — the specific bug the current cache key would cause.
- Reply-language matching is a prompt-behaviour concern, not something this branch's automated
  tests can lock down (there is no generation module yet). Track it as generation-module
  verification once that module lands, per
  [Review text and reply language](#review-text-and-reply-language).
- Locale resolution: an authenticated user with `locale = 'de'` and an `Accept-Language: en` header
  gets German (column wins); an anonymous request with `Accept-Language: de` gets German; an
  anonymous request with `Accept-Language: fr` gets English (fallback, not an error).
- **Responsive layout in German, checked against the running app rather than assumed.** German
  runs longer than English throughout — `messages/de.json` grows individual strings by as much as
  2x (`nav.reviewQueue`: "Review Queue" → "Bewertungswarteschlange") — so any container sized to
  English's word lengths is a candidate for breaking. Found two real regressions this way, both
  verified by measurement (`getBoundingClientRect`/`scrollWidth` comparisons against the real
  component classes), not by eyeballing a screenshot:

  1. The public `SiteHeader`'s fixed `justify-between` row (logo, language switcher, sign-in, CTA)
     had no wrap/truncate/scroll fallback and measurably overflowed the viewport in German at real
     narrow phone widths (`document.documentElement.scrollWidth > clientWidth`, confirmed absent
     in English at the same width) — down to ~366px; German alone doesn't cause it above that.
     Fixed by making the switcher icon-only below `sm` and tightening that row's gap below `sm`,
     verified clean down to 360px (a real, common Android width) with `sm:`-and-up spacing
     untouched. 320px (the discontinued iPhone 5/SE width) still overflows and is knowingly not
     chased further — negligible real traffic, and closing it would mean trimming pre-existing
     English-approved elements (e.g. dropping "Anmelden" outright) rather than a German-specific
     fix.
  2. `ReviewTable`'s classification column: initially recorded here (wrongly — see below) as
     safe because the table wraps in `overflow-x-auto`. That's true of the *table*, but this
     specific table also sets `table-fixed`, which pins each column at its declared width
     (`w-48` for classification) rather than growing it for wide content the way `auto` layout
     would — and `ClassificationBadge` is `w-fit whitespace-nowrap` with nothing constraining it
     to the cell, so the longest German classification (`auto_reply_candidate`, 34 characters,
     "Kandidat für automatische Antwort") rendered 50px wider than its `w-48` column and spilled
     visibly into the "Status" cell next to it, rather than scrolling — confirmed by building the
     real `<table>` markup with `table-fixed` and measuring the badge's rect against its cell's.

     First fix attempt used `max-w-full truncate`, which contained the overflow but — reported
     directly — silently hid the second half of the classification behind an ellipsis. That
     traded one bug for a worse one: classification is information someone is actually meant to
     read here, not decoration a clipped label is acceptable on. Replaced with
     `max-w-full whitespace-normal break-words` (wrap instead of truncate) on both badges and the
     escalation-reason span, widened the column from `w-48` to `w-56` to reduce how often two
     lines are needed, and dropped the now-pointless `title` attribute this created on the
     escalation span (kept on the two `Badge`-based components regardless, since their other,
     non-table callers may still truncate). `min-w-0` on the containing flex column is still what
     makes wrapping engage inside the cell instead of pushing it wider — `Badge`'s own `w-fit`
     still wins over a bare `max-w-full` without it. Threaded through an optional `className` on
     `ClassificationBadge`/`ReviewStatusBadge`, both otherwise unchanged for their other callers —
     the mobile card list and the review detail page don't pass it and keep the original
     unclamped, wrap-friendly behaviour. Verified with the same real-markup measurement: the full
     34-character string now renders complete, wrapped onto two lines (badge height 38px vs. 22px
     single-line), with 0px horizontal overflow on both the classification and status columns.

     One follow-up caught along the way: the `TableHead` for "Classification" still said `w-48`
     after the column body was widened to `w-56` — since `table-fixed` takes its column widths
     from the *first row*, that stale header width was almost certainly what actually controlled
     the rendered column, meaning the widen likely never took visible effect until both cells
     agreed. A second follow-up (requested directly): both badges, the escalation span, and their
     header labels are now horizontally centered within their cells (`items-center`/`text-center`
     in place of the default start-alignment) — verified by comparing cell-center to badge-center
     in the same real-markup measurement: 0px offset on both columns, with the 0px overflow from
     above still holding.

  Everywhere else checked came back already handled by the existing component library, not
  something this branch had to add: the mobile bottom nav's flex cells (`flex-1` with the CSS
  default `min-width: auto`) give an unbreakable long German word exactly the room it needs and
  shrink its siblings to fit, verified down to 320px with no overflow; the sidebar's
  `SidebarMenuButton` already truncates its label span; dashboard stat card labels are a plain
  wrapping `<p>`, so a longer label just grows the card by a line; and the Settings tab bar was
  already built `overflow-x-auto` with `flex-none` triggers for exactly this reason.
- **Code review of the MR (!13) turned up four further issues, all fixed on the branch.** Worth
  recording because two of them were invisible to the verification above — it checked that things
  *rendered*, not that they *worked*:
  - The `(auth)` layout's language switcher rendered but **could not be clicked**: its
    absolutely-positioned wrapper and the content wrapper were siblings both at `z-10`, switcher
    first in DOM, so the content wrapper won the hit test. Confirmed with
    `document.elementsFromPoint` at the button's own centre before fixing it (`z-20`). Screenshots
    and SSR-HTML checks could never have caught this; only a hit test or a real click could.
  - **Every `Intl.*Format` in the app was pinned to `"en-US"`** (14 call sites), so German
    localized the strings and nothing else — "Jan 5" instead of "5. Jan.", "3 hours ago" instead
    of "vor 3 Stunden", `$1,234`/`1,234` instead of German grouping. Migrated to next-intl's
    `useFormatter()` (which resolves from the active locale) and made `formatRelativeTime` take a
    required `locale` so it can't silently default back to English; `relative-time.test.ts` now
    asserts German output directly.
  - `Accept-Language` negotiation ignored `q` weights, so `de;q=0, en` — a client explicitly
    *rejecting* German — resolved to German. Now parses `q`, drops `q=0`, and sorts by weight.
  - The message-parity test serialized its mismatch report with `JSON.stringify` over `Set`s,
    which renders as `{}` — so the diagnostic was blank on exactly the runs where it fires.
  Plus one genuine regression in the backend auth fix on this branch, described under
  [Session / token model](../backend/auth/overview.md) — the loser of a concurrent refresh-token
  rotation was clearing the winner's freshly-issued cookies, logging the user out of every tab.

## Decisions

1. **Review text and reply language.** `review_text` is not touched — no ingestion fix, no
   migration. Reply language is decided entirely by the generation prompt at call time (detect
   English/German from the review, reply in kind, default to English otherwise). See
   [Review text and reply language](#review-text-and-reply-language) for the mechanism and its one
   caveat (Google's own translation mashup, on rows where it occurs).
2. **URL prefix for German, or cookie-only?** Cookie-only for the whole app, per the
   recommendation above — no `[locale]` route segment, no churn to `typedRoutes`.
3. **Who supplies the German copy?** No dedicated translator identified. Engineering will draft
   the German strings directly (web `messages/de.json`, backend `messages.de.ts`, email templates)
   as best-effort, and it should get a native-speaker or professional pass before anything
   security- or legally-sensitive (auth flows, consent, billing copy) ships to real users.
