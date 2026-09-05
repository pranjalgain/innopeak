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
| Onboarding Signup | Built (`(auth)/onboarding/signup`) — deviates from the design: no manual business-name field for any method; identity → Connect Google Business Profile supplies it instead (2 steps for Microsoft/Google, 3 for the password path — an "identity" step gains a verify-email OTP step in between, since only the SSO/social providers assert a verified email themselves) |
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
mocked `location` is also what supplies the business name/address to both — nothing asks for it
manually.

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
`useNotifications`, `useAuth`) surfaces failures via `sonner`'s `toast.error`, and discrete
one-shot mutations (add/remove a blocklist term, toggle a setting, approve/reject a reply, save a
prompt version, sign out) surface success via `toast.success` — both called from inside the hook,
using a `useTranslations("<screen>.toasts")` namespace scoped to that screen/hook, never from the
component. The one deliberate exception is `useSettings`' `updateGeneral`: it also backs a
continuous slider, so it stays toast-free itself and the two callers that only ever invoke it for a
discrete change (`GeneralSettingsSection`'s auto-post switch, `AiSettingsSection`'s reply-count
select) toast on their own. High-frequency/low-stakes state (marking a notification read) is
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

next-intl, single-locale (`en`) for now — string extraction only, no `[locale]` route segment or
middleware. Config: `src/i18n/request.ts`. Messages: `messages/en.json`, one top-level key per
screen/section. Use `useTranslations("namespace")` in both Server and Client Components (the root
layout wraps `children` in `NextIntlClientProvider`). Add a locale switcher and routing only when
a second locale is actually needed.

Mock/placeholder **data** (a person's name, initials, a business name) is not UI copy and doesn't
go through next-intl — only translate strings that are part of the interface itself.

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
