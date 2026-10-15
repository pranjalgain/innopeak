# Web Application

`apps/web` is a Next.js (App Router) app implementing the InnoPeak UI. It uses shadcn/ui (Radix
primitives + Tailwind CSS v4), Drizzle for its own local schema experiments, and next-intl for
localization.

## Design source

All 7 screens below were originally built against `apps/backend/docs/innopeak-design.html`, an
"Appifact" bundle (a JSON blob of one `.dc.html` source per screen/breakpoint) — that file has
since been deleted now that every screen is built, so it's no longer available to extract from.
This doc, the actual component source, and the per-screen deviation notes below are now the source
of truth for copy/layout/behavior; there's nothing left to cross-check against the original mockup.

Screens (7, each at Desktop/Tablet/Mobile):

| Screen | Status |
|---|---|
| Login | Built (`(auth)/login`) |
| Dashboard | Built (`(dashboard)/dashboard`) |
| Review Queue | Built (`(dashboard)/review-queue`) |
| Review Detail | Built (`(dashboard)/review-queue/[reviewId]`) |
| Settings | Built (`(dashboard)/settings`, plus `(dashboard)/settings/prompts` for AI prompt management — not in the original design) |
| Onboarding Signup | Built (`(auth)/onboarding/signup`) — the password path's identity step collects the tenant/company name directly (`CreateAccountForm`'s Company name field); Connect Google Business Profile only ever supplies a *location's* name, a separate thing (2 steps for Microsoft/Google, 3 for the password path — an "identity" step gains a verify-email OTP step in between, since only the SSO/social providers assert a verified email themselves) |
| Onboarding Connect | Built (`(auth)/onboarding/connect`) |

`(dashboard)`'s layout gates every screen behind it (Dashboard, Review Queue, Review Detail,
Settings) on having a connected Google Business Profile — `GoogleConnectionGuard` redirects to
Onboarding Connect otherwise. Connection status is tracked by `GoogleConnectionService`
(localStorage-backed for now, single source of truth shared with Settings → Connection's
disconnect action) since there's no real session/backend yet.

Sign-out (both account-menu instances — `AppHeader` and the sidebar footer) calls
`AuthService.logout()` via `useAuth`'s `logout()`, which redirects to `/login`; there's no real
session to invalidate yet, so this is a placeholder for the eventual backend logout call, not a
`disabled` no-op.

Onboarding Signup and Onboarding Connect share the same underlying Google-connect stages
(`ConnectStage`/`ConfirmLocationStage`/`BackfillingStage`/`DoneStage` + `useOnboardingConnectFlow`,
under `(auth)/onboarding/connect/_components`) — Signup embeds them as its step 2 (with a stepper
header), while the standalone Connect screen renders them alone (no stepper, since that's the
reconnect path for an already-logged-in user, not a new signup). `useOnboardingConnectFlow`'s
mocked `location` supplies that location's own name/address — a separate thing from the tenant's
company name, which the password path's identity step collects directly instead (matching the
backend: `tenants.name` vs. per-location `locations.name`, see the auth module's overview.md).

### Prompt performance analytics (Settings → Prompts)

Each `ReviewReplyDraft` (on `Review.replyDrafts`) records which prompt + version generated it
(`promptId`/`promptVersion`), its AI-drafted text before any edits (`originalContent`, separate
from `content`), and `createdAt`/`decidedAt` timestamps. `computePromptVersionStats`
(`src/app/_libs/utils/prompt-analytics.ts`) aggregates this per prompt/version into approval rate,
edited-vs-approved-as-is split, and average time-to-decision — surfaced via `usePromptAnalytics`
and rendered as a `PromptVersionStatsLine` on both the current version (`PromptList`) and every
historical version (`PromptVersionHistory`). This is groundwork only — no real generation call
exists yet, so `PromptService`/mock data populate these fields directly; the real integration just
needs to keep writing them the same way.

### Notification panel (dashboard header)

`AppHeader`'s bell icon (`src/app/(dashboard)/_components/notification-panel.tsx`) opens a
`Popover` listing `Notification`s (`src/types/domain.ts`) — escalated reviews, drafts awaiting
approval, sent replies, connection issues — each optionally deep-linking to
`ROUTES.REVIEW_DETAIL`. Not in the original design. Follows the same mock layering as everything
else: `mock-data/notifications.ts` → `NotificationService` → `useNotifications` (load-once,
optimistic mark-as-read/mark-all-as-read, no toast on those — see "Toast notifications" below for
why). `formatRelativeTime` (`src/app/_libs/utils/relative-time.ts`) renders "3 hours ago"-style
timestamps and is generic enough to reuse anywhere else a timestamp needs the same treatment.

## Toast notifications

Every data-loading hook (`useSettings`, `usePrompts`, `useReviewQueue`, `useReviewDetail`,
`useNotifications`, `useAuth`, `useTenantOwnerProfile`) surfaces failures via `sonner`'s
`toast.error`, and discrete one-shot mutations (add/remove a blocklist term, toggle a setting,
approve/reject a reply, save a prompt version, change password, sign out) surface success via
`toast.success` — both called from inside the hook, using a `useTranslations("<screen>.toasts")`
namespace scoped to that screen/hook, never from the component. Settings → Profile's password
form (`AUTH_METHODS.password` only) calls `POST /v1/auth/change-password` through
`TenantOwnerProfileService` → `AuthService.changePassword`; a success stores the rotated access
token the same way login does. Avatar upload on that tab is still mock. Settings → Blocklist
loads and mutates terms through `GET`/`POST`/`DELETE /v1/settings/blocklist-terms` (`SettingsService`);
the chip input is cleared only after a successful add, and a 409 duplicate surfaces the backend
message. Settings → General loads and saves the tenant singleton through `GET`/`PUT /v1/settings`
(`escalationRatingThreshold`, `autoPostEnabled`, `reviewDataRetentionMonths`). Threshold and
retention writes are debounced; the auto-post switch writes immediately. `aiReplyCount` stays
local-only (no column). The one deliberate exception is `useSettings`' `updateGeneral`: it also
backs a continuous slider, so it stays toast-free itself and the two callers that only ever invoke
it for a discrete change (`GeneralSettingsSection`'s auto-post switch, `AiSettingsSection`'s
reply-count select) toast on their own. High-frequency/low-stakes state (marking a notification read) is
optimistic and silent — no toast, matching how often it fires.

`src/components/ui/sonner.tsx`'s `Toaster` reads `forcedTheme ?? theme` from `useTheme()`, not
`theme` alone — `next-themes` never folds a forced theme into `theme`/`resolvedTheme`, so since the
app forces light mode app-wide (see `ThemeProvider` in `layout.tsx`), toasts would otherwise render
dark for a visitor with a dark OS preference.

## Theming & fonts

Already fully set up — no changes needed to add a screen. `src/app/globals.css` defines
light/dark OKLCH tokens (including semantic `success`/`warning`/`destructive` + `-soft` variants)
via Tailwind's `@theme inline`, originally matching the (now-deleted) design file's embedded tokens
1:1. Fonts (Geologica sans, Fira Code mono) are wired through `next/font/google` in
`src/app/_config/fonts.ts`.

`globals.css` also defines a handful of custom utilities in its `@layer utilities` block, added
deliberately after the initial build (see git history for the "tune the UI"/"fluid style" work)
rather than reflecting anything from the original design:

- `.shadow-elevated` — the one elevation treatment for every `Card` and ad-hoc bordered surface;
  don't reintroduce Tailwind's `shadow-sm` or an inline `shadow-[...]` recipe at a new call site.
- `.text-fluid-title` / `.text-fluid-heading` / `.p-fluid-page` / `.gap-fluid` — `clamp()`-based
  sizing for page titles, section headings, page padding, and grid gaps, so they scale continuously
  with viewport width instead of jumping at Tailwind's fixed breakpoints. Use these on every new
  page view's `<h1>`/padding wrapper rather than hardcoding `text-2xl`/`p-4 sm:p-6 lg:p-8` again.
- `.ease-fluid` — the shared `cubic-bezier(0.22, 1, 0.36, 1)` easing curve for interactive
  transitions (buttons, tabs, sidebar nav hover) and entrance animations (`animate-in` combos) —
  pair it with `tw-animate-css`'s utilities (`fade-in`, `slide-in-from-bottom-2`,
  `fill-mode-backwards`, `delay-*`) rather than a bare `duration-*` when adding new motion.

**Business card.** The dashboard's business card (`BusinessProfileCard`) shows the business name, its Google category,
Google's own rating with one decimal and the review count (the rating covers every review, not just the imported
ones), the address, phone and website when listed, and the last sync time with a badge: green "Sync OK", red "Sync
failed" (hover explains that new reviews may be missing and that it is retried), none before the first sync. Category
and rating are left out until a sync has read them. Screen readers get the full sentence ("Rated 4.3 out of 5 on Google, from
212 reviews") as visually hidden text, and the short visible form is hidden from them; an `aria-label` on a plain span would be
ignored. See `GET /v1/connections` in the connections API reference.

**Billing-only admin surfaces follow one rule.** Stripe webhook deliveries only exist where billing does, so the admin Billing
nav item and the **Webhook activity** tab on `/admin/activity` are shown when the deploy has payments on
(`paymentFeatureEnabled`) **or** while any business is still on Paid (Stripe keeps billing them, so their events still
arrive), and hidden while that is loading. If either check *fails*, the tab is shown anyway: hiding it would present "no
deliveries" for events that may well be arriving. A bookmarked link to the hidden tab opens Platform activity instead.

**Floating sidebar.** The desktop sidebar (`AppShell`, shared by the tenant dashboard and the admin console) is the
shadcn `floating` variant: a detached, rounded panel (`rounded-3xl`, `shadow-elevated`) inset from the screen edge,
with pill-shaped nav items. The active item is a pill that slides between items (a shared `motion` `layoutId`) and
carries a soft glow in the brand colour (`--sidebar-primary`); when the sidebar collapses to icons, the active icon
shows its own circle instead. The list is padded inside the panel so the pill and its glow never touch the rounded edge (the list scrolls, so a glow outside its box would be clipped into a pale rectangle), and the panel is 17.5rem wide so the longest German label ("Bewertungswarteschlange") is not truncated; check that width before adding a longer label. The mobile bottom nav is unchanged.

**Dark palette.** The `.dark` tokens in `globals.css` are a "midnight indigo": surfaces lean violet (hue about 285) with real
chroma instead of near-neutral navy, layered in lightness (page, card, popover, accent), and the brand blue is pushed
toward electric indigo (`--primary` 0.62 / 0.23 / 268). The semantic colours (success, warning, destructive and their
`-soft` surfaces) are brighter and more saturated. Contrast was checked, not eyeballed: body text on page and card is
about 18-19:1 (near-white, 0.99), muted text 12-14:1 (a light 0.88 grey rather than a mid grey, which read dim beside bold text), brand colour as text on the page 4.95:1 and white on the brand colour 3.9:1 (the
light theme is unchanged). `--primary` is the one token used both as a background under white text and as text on dark
surfaces, so its lightness is a compromise; do not raise it without checking both uses.

**Theme-change scenes.** Switching theme plays a short one-shot scene over the page (`ThemeTransition`,
mounted once in the root layout): a thunderstorm with two lightning strikes going to dark, a sunrise with a
rising sun and rays going to light, about 2.6 seconds (`THEME_EFFECT_MS`; the CSS keyframes read it through
`--theme-fx-duration`, so the two cannot drift). It plays only on a change, never on page load or for the first
theme the provider reports, and it also reacts to a change made in another tab. It is decorative: `aria-hidden`,
`pointer-events: none` so it never blocks a click, the whole scene is drawn at 60% strength so it reads as a backdrop, only opacity and transform are animated (with a gentle ease and flashes that swell and fade instead of snapping), and it is not rendered
at all under `prefers-reduced-motion`. The styles (`.theme-fx*` and the `theme-storm-*` / `theme-sun-*`
keyframes) live in `globals.css`; their colours are literals on purpose, since they paint a moment in the sky and
not a surface that should follow the light/dark tokens. It is deliberately not a looping background: a permanent
animation behind a data-heavy dashboard would distract and cost battery.

## Component placement

- **Page/feature-specific** components live colocated with the route, in that route's
  `_components/` folder — e.g. `src/app/(dashboard)/dashboard/_components/stat-card.tsx`. This is
  the existing Next.js App Router co-location pattern already used throughout `src/app/**/_components`.
- **Cross-feature** components (used by more than one screen/route group) live in
  `src/components/common/` — e.g. `escalation-badge.tsx`, `star-rating.tsx` (used on Dashboard
  today, Review Queue/Review Detail next).
- **shadcn/ui primitives** stay in `src/components/ui/` untouched, aside from adding cva variants
  (see "Button variants" below) — don't fork or wrap them.

Never drop a new component directly under `src/components/` — it belongs in `common/`
(cross-feature) or a route's `_components/` (single-feature).

### `src/components/ui` inventory

Kept, in use: `alert-dialog`, `alert`, `avatar`, `badge`, `button`, `card`, `checkbox`, `dialog`,
`drawer`, `dropdown-menu`, `form`, `input`, `label`, `popover`, `progress`, `radio-group`,
`scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `switch`,
`table`, `tabs`, `textarea`, `tooltip`.

Removed as unused against the current 7-screen design (`accordion`, `aspect-ratio`, `breadcrumb`,
`calendar`, `carousel`, `chart`, `collapsible`, `command`, `context-menu`, `hover-card`,
`input-otp`, `menubar`, `navigation-menu`, `pagination`, `resizable`, `toggle-group`) — re-add via
`npx shadcn add <name>` if a future screen genuinely needs one. `toggle.tsx` is also currently
unused (it was only a dependency of the removed `toggle-group`) but wasn't part of that pass —
revisit once Settings is built.

## Hook placement

All hooks live under one central `src/hooks/` tree, grouped by domain — not colocated inside the
routing tree:

- `src/hooks/common/` — generic, non-feature hooks (viewport/breakpoint detection). A type that a
  common hook exports (e.g. `Breakpoint`) lives alongside it as a sibling `*.types.ts` file, not
  inside a feature folder.
- `src/hooks/<domain>/` — one folder per domain, e.g. `src/hooks/auth/use-auth.ts`,
  `src/hooks/tenant/use-tenant.ts`, `src/hooks/dashboard/use-dashboard-stats.ts`. Group by the
  domain the hook belongs to, not by which route happens to call it.

## SVG / icon assets

Hand-authored SVGs (brand marks, vendor logos, decorative art) go in `src/assets/icons/` as small
components taking `size`/`className` props, so they're never copy-pasted between call sites — see
`microsoft-logo.tsx`, `innopeak-logo.tsx` (full wordmark lockup) / `innopeak-diamond-mark.tsx`
(mark only, for collapsed contexts like the icon-only sidebar rail), `auth-decoration.tsx`. Library
icons (`react-icons`' `Lu*` set) are untouched — those aren't project assets.

## Button variants over repeated className

If the same Tailwind utility string is being applied to a `Button` at more than one call site, add
it as a `size`/`variant` option in `buttonVariants` (`src/components/ui/button.tsx`) instead of
repeating the className. Example: the `block` size (`h-10 w-full gap-2.5 text-sm font-medium`)
replaced identical inline classNames on the Login and mock-SSO submit buttons. Only truly one-off,
single-use layout classes (e.g. `mt-2` spacing between a form's own siblings) stay as `className`.

## Types and interfaces

Mirrors the backend's `*.interface.ts`/`*.dto.ts` separation (`apps/backend/src/**/interfaces`,
`apps/backend/src/**/dto`):

- A type that is **exported and used outside its own file**, or that represents **domain/API
  data**, must live in a dedicated file — `src/types/domain.ts` for global domain types, or a
  sibling `*.types.ts` next to the hook/module it belongs to for something narrower (e.g.
  `src/hooks/common/breakpoint.types.ts`).
- An **unexported, single-use component `Props` interface** may stay inline directly above that
  component — standard React convention, consistent with the backend's own inline exceptions.

## Localization

next-intl, two locales — `en` (default) and `de` — cookie-only, no `[locale]` route segment or
next-intl routing middleware; the full rationale lives in
`apps/documentation/docs/meta/multilingual.md`. Config: `src/i18n/locales.ts` (the single place
`en`/`de` is declared — `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, the `NEXT_LOCALE` cookie name) and
`src/i18n/request.ts` (resolves `NEXT_LOCALE` cookie → `Accept-Language` header → `en`, in that
order). Messages: `messages/en.json` and `messages/de.json`, one top-level key per screen/section,
kept in lockstep — `src/i18n/messages.test.ts` asserts identical key sets and identical ICU
placeholders (`{count, plural, ...}` etc.) between the two files. Use `useTranslations("namespace")`
in both Server and Client Components (the root layout wraps `children` in `NextIntlClientProvider`
and sets `<html lang>` from `getLocale()`, not a hardcoded value).

`LanguageSwitcher` (`src/app/_components/language-switcher.tsx`) is the one locale-switching
control — a standalone dropdown, not nested inside an account menu a signed-in user would have to
open first to find it. Present in every chrome surface: the public `SiteHeader`, the `(auth)`
layout's corner, and the dashboard/admin `AppHeader` top bar (which renders on every authenticated
screen regardless of breakpoint — the one place a control is guaranteed visible without a click).
It writes the `NEXT_LOCALE` cookie and calls `router.refresh()`, which re-fetches the current
page's Server Components and therefore re-runs `request.ts` on the same round trip — no full
reload. Icon-only (no `EN`/`DE` text label) below the `sm` breakpoint: `SiteHeader`'s fixed row has
no slack left for both once German's longer button labels are in play at real narrow phone widths.

Mock/placeholder **data** (a person's name, initials, a business name) is not UI copy and doesn't
go through next-intl — only translate strings that are part of the interface itself.

German runs longer than English throughout, sometimes by 2x for a single string — treat any
fixed-width or fixed-height container holding translated text as a candidate for breaking, and
check it in German rather than assuming a layout that works in English generalizes. Two real
regressions this way, both in `apps/documentation/docs/meta/multilingual.md`'s Verification
section with exact measurements: `SiteHeader`'s row overflowing the viewport at narrow widths, and
`ReviewTable`'s classification/status badges — `table-fixed` pins a column's width rather than
growing it for wide content, and `Badge` is `w-fit whitespace-nowrap` with nothing constraining it
to the cell by default, so a long label there spills into the next column instead of scrolling or
truncating gracefully. `ClassificationBadge`/`ReviewStatusBadge` both take an optional `className`
for exactly this — a fixed-width table context passes `max-w-full whitespace-normal break-words`
(wrap, not `truncate`: classification is information someone is meant to read, not decoration a
clipped label is acceptable on) plus `min-w-0` on the containing flex column, which is what
actually lets the wrap engage inside the cell instead of the badge pushing it wider. Their other,
untableified callers (the mobile card list, the review detail page) don't pass it and keep the
original unclamped, wrap-friendly behaviour — reach for this pattern before inventing a new one
the next time translated text meets a fixed-width container.

## Signup, onboarding and billing return — behaviours worth knowing

- **Signing in returns you to where you were headed.** `proxy.ts` sends a signed-out visit to a guarded page to
  `/login?next=<path>` (or `/admin-login?next=…` for the admin console); after a successful sign-in (password, or the
  verification step for an unverified account) the login view navigates there instead of to the dashboard. `next` is
  accepted only for a same-origin path inside the dashboard, review queue and settings areas (admin areas for the admin
  login): anything else, including `//host`, backslashes and `..` segments, is ignored, so it cannot be an open
  redirect. Onboarding steps are never remembered, since where they lead depends on account state, and a visitor with
  nothing connected yet still goes to onboarding. See `app/_libs/utils/post-login-redirect.ts`.
- **Double submits are swallowed in the review detail hook.** Approve, reject, post, retry and the manual-reply save
  ignore a second click on the same action while the first is in flight (a ref, not `isPending`, so two clicks in the
  same frame are covered); the server would answer the repeat with a `409` that showed as an error toast on top of the
  success. Approve-then-reject on one draft is still allowed.
- **One fetch per endpoint per page load.** The app shell already loads `/v1/auth/me` (`["tenant-owner-profile"]`) and
  `/v1/connections` (`["connection"]`) through the shared query cache. The dashboard's tenant read and Settings' connection
  tile used to call the services directly and so fetched both again; they now read through the same cache
  (`queryClient.fetchQuery` with the shared keys, passed to `TenantService`/`SettingsService` as readers), which dedupes an
  in-flight request and reuses fresh data. New screens that need either should use the hook or those keys, not the service.
- **A rejected verification code clears the boxes.** `OtpVerificationStage`'s `onVerify` may resolve `false`; the boxes
  empty and focus returns to the first one. Focusing a filled box selects its digit, so typing replaces it.
- **Refreshing on the verification-code step resumes it.** The password signup keeps *only the
  email awaiting its code* in this tab's `sessionStorage` (`PendingSignupService`, 30 minutes, no
  password or token), so a refresh or Back/Forward shows the code box again instead of a blank form
  whose re-submit is refused ("an account with this email already exists"). It changes nothing about
  who may claim an address. "Use a different email" forgets it and returns to the form.
- **The onboarding "You're all set" screen only quotes an import count when it has one.** Opened
  again later (Back from the dashboard) nothing was imported *in that session*, so it reads as a
  plain confirmation rather than "imported 0 reviews".
- **A session that dies while a page is open sends you to sign in.** When a request 401s and the refresh fails (sessions revoked
  by a password change elsewhere, a 7-day idle expiry, an admin's 15-minute token), the response interceptor in
  `api-sdk/config.ts` navigates to `/login?next=<this page>` (`/admin-login` for an admin) via `signInPathFor`, once. It does
  nothing off the guarded areas (marketing, onboarding, the sign-in screens) and for a visitor who never had a session. Before
  this the page stayed up on "Couldn't load…" states until the next navigation.
- **Tab strips add a history entry.** Settings, Admin Settings, Admin Activity and the admin Overview/Statistics switch write
  `?tab=` with `router.push`, so Back steps back through the tabs (filters, search and typing still *replace*, see
  [Admin Console](./admin-console.md)).
- **A confirm dialog confirms once per opening.** `ConfirmActionDialog` ignores a second click on its button until it is reopened:
  the dialog closes on the first click but its button stays in the DOM through the exit animation, so a quick double-click on
  Suspend or Request erasure used to send two requests.
- **Erasure deadlines come from the server.** The delete dialog, the admin "Erasure takes effect on" note and the Members "Removal
  takes effect on" note count from `erasureGracePeriodDays` on `GET /v1/settings/platform-config` (the backend's
  `ERASURE_GRACE_PERIOD_DAYS`, read through `useErasureGracePeriodDays`; 21 while the settings load). Day counts use ICU plurals
  ("1 day", "21 days") in both locales.
- **There is no analytics, and error reporting needs no account of someone else's.** The app ships no tracker, tag manager or consent banner, so
  there is nothing to consent to; adding one means adding the consent handling with it. Sentry is off unless `NEXT_PUBLIC_SENTRY_DSN` is set,
  reports no personal data (no default PII, no replay, cookies/headers/queries scrubbed) and forwards only an allow-list of request headers;
  source maps are uploaded and removed, never served. No third-party key is hard-coded anywhere.
- **No starter-template pages ship.** `/users`, `/reference`, `/sentry-example-page` and their API routes are gone; `tests/e2e/smoke.spec.ts`
  checks they stay gone and that guards and headers hold and no analytics or tag-manager script loads (`E2E_BASE_URL` points it at an environment).
- **A checkout `session_id` the server does not recognise is reported as not found,** not as "Stripe couldn't be reached": a 404 from
  `POST /v1/billing/checkout/reconcile` is not retried and its banner offers no "Check again".
- **The admin sign-in page offers "Continue with Microsoft" (sign-in only), and tells admins there is no sign-up.** The button follows
  `adminMicrosoftLoginAvailable` on `GET /v1/settings/platform-config` (the Microsoft client plus a pinned Entra directory, a deploy
  fact), not the tenant-facing `microsoftLoginEnabled` switch, and navigates to `/v1/admin/auth/microsoft`; with Google also on, the two
  sit side by side like on the tenant sign-in. Failures return as `/admin-login?error=…&provider=microsoft`, and on that page
  `ssoErrors.admin.NO_ACCOUNT` replaces "sign up first" with "admin accounts are by invitation only".
- **A guarded admin route with no session goes to `/admin-login`**, matching what the edge
  (`proxy.ts`) does for a fresh visit — so signing out and pressing Back no longer lands on the
  tenant sign-in page.
- **A fresh signup must choose a plan before connecting a business.** `/onboarding/plan` records the
  choice in the wizard's session context (`OnboardingContextService`, `plan: "free" | "paid"`):
  Continue with Free sets `free`; a completed checkout sets `paid`. `/onboarding/connect` sends a
  signup with no recorded plan back to the plan screen, and only then mounts the connect flow. A
  returning owner reconnecting from Settings has no wizard context and is never gated. A context
  saved before this gate shipped carries no `planGated` marker and reads as Free, so anyone
  mid-wizard at deploy time isn't bounced (transitional; removable a week after deploy).
- **The plan step only exists when billing does.** With the platform's payment feature off
  (`paymentFeatureEnabled` from `GET /v1/settings/platform-config`, i.e. `PAYMENT_FEATURE_ENABLED`) every
  signup is on Free and there is nothing to choose, so the step is skipped: the signup and business-name steps hand off
  (`useHandOffAfterSignup`) straight to `/onboarding/connect` with Free already recorded, so nobody lands on the plan page.
  `/onboarding/plan` keeps the same record-and-forward as a safety net for a signup that finished before the settings had
  loaded. The stepper (`useOnboardingSteps`)
  leaves the "Choose your plan" step out, and the connect screen does not offer "Back to plan selection".
  While the settings are still unknown the step is kept, so a deploy with payments on never loses it.
- **Returning from Checkout during signup.** Stripe returns to `/settings?…&checkout=…`, which
  `ConnectionGuard` bounces for an owner with no connected business, so the guard handles it: a
  cancelled checkout goes back to `/onboarding/plan?checkout=cancel` (with a toast) and forgets the
  choice; a completed one is reconciled with Stripe first (the Billing tab never renders to do it),
  then continues to `/onboarding/connect`. A skeleton shows meanwhile, and the redirect is dropped
  if the guard is gone before the reconcile answers. Once Paid, `/onboarding/plan` forwards to
  connect so its Upgrade button can't be offered again; the backend refuses a second Checkout
  regardless (`409 ALREADY_SUBSCRIBED`). On Free, the connect screen offers "Back to plan
  selection" until locations are being imported.
- **The location picker is a radio group when the plan has room for exactly one more location**
  (Free), checkboxes otherwise. It follows the server's remaining capacity only, never the
  wizard's recorded choice.
- **After Stripe Checkout, the Billing tab says where the payment stands.** Landing on
  `?checkout=success&session_id=…` reconciles with Stripe; unless the plan is confirmed Paid, a
  banner stays above the Billing tab ("still processing" or "couldn't confirm") with a **Check
  again** button, instead of a toast that disappears. The outcome is read from the
  `mutateAsync` promise, not per-call callbacks, for the Strict Mode reason below.

## Server state (TanStack Query) and failure behaviour

`createQueryClient()` (`src/app/_libs/utils/query-client.ts`) sets `retry: false`, so a failed
query is not retried on its own, and keeps TanStack's default `retryOnMount` — navigating away and
back to a page whose request failed tries again.

The thing that must never happen is the **guard loop**. `ConnectionGuard` swaps the whole shell for a
skeleton while `useConnection` reports `isLoading`; TanStack resets an errored, data-less query to
`pending` the moment it refetches, so `isLoading` went true again on every retry, the children
unmounted, remounted (a new observer retries a failed query), and so on — about 100 requests a
second against a failing API, indefinitely, and a 429 from the rate limiter only kept it going.
Guard-feeding hooks (`useConnection`, `useTenantOwnerProfile`) therefore report
`isInitialLoad(query)` — loading *and never errored* — so a query that has already failed fails
open instead of blanking the shell again. Measured against a stub API answering 429 and 500:
7–8 requests in 20 seconds, down from ~100 a second. A page left open through a backend outage
heals itself too: `refetchOnWindowFocus` is on **only for a query currently in the `error` state**,
one request per focus, never a loop.

**How fresh the data is.** The default `staleTime` is 5 minutes: moving between tabs or pages inside that window
shows the cached data without a request, and after it the screen shows the cache and refreshes in the
background. That suits data the user changes themselves (their own edits update or invalidate the cache). Two
screens show data that changes on the server without the user doing anything, a new review arriving from the
15-minute poll or a teammate approving a reply, so the **review queue** and the **dashboard** spread
`liveQueryOptions` (`query-client.ts`): a 60-second `staleTime` and `refetchOnWindowFocus: true`. Returning to the
window after a minute refreshes them, and refocusing within a minute does nothing. Their error state uses
`isLoadingError`, not `isError`, so a refresh that fails in the background (a focus refetch while offline) keeps the
rows and figures already on screen instead of swapping them for an error. A new review that creates no
notification (a 5-star reply handled automatically, say) is only picked up this way, since the notification
stream does not cover it. Use `liveQueryOptions` for any new screen whose data changes without the user acting;
there is deliberately no polling.

When a request must survive a Strict Mode remount (a redirect after a mutation, say), read its
outcome from the promise `mutateAsync` returns — a per-call `onSuccess` and the mutation's
`isSuccess` are both lost when the observer detaches mid-flight.

## Local dev stack

`apps/web/docker-compose.yml`'s Postgres/MySQL/Redis containers are generic boilerplate scaffolding
(multi-dialect Drizzle demo) — nothing in `apps/web`'s own source imports Redis, and no screen is
wired to a real database yet (everything goes through `src/app/_libs/services/*.service.ts` mock
services). You don't need to run `pnpm docker:up` for current frontend work. If that stack ends up
unused once Review Queue/Settings land, it's a candidate for removal.

## Before scaffolding a new screen

1. There's no design mockup to extract from anymore (see "Design source" above) — base layout and
   copy on the closest existing screen and this doc, and confirm with whoever's requesting the
   screen rather than guessing.
2. Check which `ui/` primitives the screen actually needs before reaching for shadcn's full
   catalogue (see inventory above).
3. Add new UI copy to `messages/en.json` under that screen's key as you write the component, not
   as a follow-up pass.
