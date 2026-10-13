---
sidebar_position: 2
---

# Admin Console: search, pagination, and the loading-state trap

The Super Admin console (`apps/web/src/app/admin/`) — Overview, Businesses, Users, Billing,
Activity — is where every server-side search/pagination/filter pattern in this frontend was
established, iterated on, and in one case debugged after shipping. This page documents the shared
pattern and the one mistake worth not repeating, rather than duplicating each screen's own
narrower doc (see [Admin Overview](../backend/admin-overview/overview.md#consumers),
[Admin Billing](../backend/admin-billing/overview.md#consumers), and [Admin
Management](../backend/admin-management/overview.md#consumers) for what each screen actually
shows).

## The pattern: debounced search + server-side pagination via TanStack Query

Every list on the console that searches or paginates follows the same shape, first established by
`useReviewQueue` (`apps/web/src/hooks/reviews/use-review-queue.ts`) and then reused by
`useAdminBusinesses`, `useAdminUsers`, `useAdminBillingWebhookEvents`, and
`useAdminPlatformActivityLog`:

1. **`search`/`page`/`filter` state owned by the hook, not the view, and kept in the URL** (`?page=2&q=term&status=new`,
   via `useUrlQueryState`, `useUrlSearchPage` for a searchable list and `useUrlFilterPage` for a filter-only one such as the
   webhook-events and platform-activity lists, with `?type=`) so a reload, a shared link and Back/Forward keep your place. Changing
   page *pushes* a history entry (Back returns to the previous page of the list); typing a search or choosing a filter
   *replaces* it (those would otherwise each become a Back stop). A search or filter change drops `page` in the same
   navigation, a `?page=` past the last page is pulled back to the last real one, and an unknown filter value in the URL
   reads as "all". The search box keeps its own text while you type and writes the debounced term to the URL; Back/Forward
   put the URL's term back into the box. A term is cut to 200 characters (`MAX_SEARCH_LENGTH`, the strictest list API limit) whether
   typed, pasted or arriving in a link, and the inputs carry `maxLength`, so no input can earn a 400 that reads as a server fault.
2. **A debounce timer on the search term only** (300ms) — `setTimeout`/`clearTimeout` in a
   `useEffect` keyed on the raw search value, writing to a separate `debouncedSearch` state that's
   what actually feeds the query. Filters and page changes are never debounced — those are
   discrete choices a click already made, not something typed one character at a time.
3. **The debounced value (plus page/filter) becomes the `useQuery` key**, e.g.
   `[...adminBusinessesQueryKey, { search: debouncedSearch }]`. A parameterized key, not a flat
   one — TanStack Query caches each distinct search/page/filter combination separately.
4. **A page/filter change resets `page` to `1` in the same URL update that changes the filter**, and a pending search
   term reads as page 1 until its URL write lands, so no request is ever issued for a stale page under the new filter
   (the wasted round trip `useReviewQueue`'s old render-time reset existed to prevent). `useReviewQueue` also keeps a
   deep-linked page when the active business is first resolved; only a switch between two known businesses resets it.
5. **`placeholderData: keepPreviousData`** on the `useQuery` call, so the previous result set (and
   its `total`/`totalPages`) stays on screen while the next search/page's fetch is in flight,
   instead of the list flashing empty.

## The bug this pattern can hide: `isLoading` mapped to `isFetching`

Every hook above returns an `isLoading` flag the view uses to decide whether to render a full
loading skeleton instead of real content. TanStack Query offers two candidates for that flag, and
they mean different things:

- `query.isLoading` — true only while there is **no cached data at all yet** (the genuine first
  load).
- `query.isFetching` — true on **every** request this query makes, including a background refetch
  of a page/filter that already has data on screen, thanks to `keepPreviousData`.

Four hooks in this codebase (`useReviewQueue`, `useAdminBillingWebhookEvents`,
`useAdminPlatformActivityLog`, and — for one session — `useAdminBusinesses`/`useAdminUsers`) mapped
`isLoading` to `isFetching`, on the reasoning that the loading indicator should reflect *every*
fetch, not just the first. That reasoning is defensible in isolation, but it interacted badly with
how the consuming views used the flag: several of them gated their **entire content area** — not
just the row list, but the search box, the result count, and the pagination footer — on that one
`isLoading` value. The practical symptom, reported directly: typing into a search box made "the
whole application" feel like it refreshed on every keystroke, because the debounced search
kicked `isFetching` true, which blanked the search bar and count and swapped in a full skeleton,
then restored them a moment later once the fetch settled — repeated on every keystroke.

**The fix, applied to all four hooks**: `isLoading` now maps to `query.isLoading` (first load
only). `placeholderData: keepPreviousData` already keeps the previous rows — and `total`, so
`totalPages` doesn't dip either — on screen while a background refetch is in flight, so a
background refetch needs no loading state of its own. The two admin cards
(`billing-webhook-events-card.tsx`, `platform-activity-log-card.tsx`) only used the flag to hide
their `Pagination` footer, which is a smaller version of the same mistake — the footer was
disappearing and reappearing on every filter change or page click even though the rows underneath
never needed to.

**The lesson, for the next hook that wraps a searched/paginated `useQuery`**: if `keepPreviousData`
is already keeping stale-but-valid data on screen during a refetch, `isFetching` is the wrong
signal for "should the view show a loading state instead of what it already has." Reach for
`isFetching` only when you specifically want a *subtle* in-place indicator (a spinner badge, a
disabled control) layered on top of content that's still visible — never as the condition that
decides whether to render that content at all.

## Empty state vs. no-results state, with server-side filtering

A related trap: once search is server-side, the frontend never sees the *unfiltered* row count to
compare against. `AdminBusinessesView`/`AdminUsersView` originally decided between "nothing here
yet" (empty state) and "no matches for your search" (no-results state, with a "clear search"
action) by comparing a client-side-filtered array's length against the full array's length. With
search server-side, both hooks now expose the search value itself, and the view branches on
whether a search term is active (`search.trim().length > 0`) rather than on any count comparison —
the only signal available once the server is the one doing the filtering. The same fix applies to
the "hide the search box entirely" condition: it must stay keyed on "no data *and* no active
search," not "no data," or a search that legitimately returns zero rows makes the search box
(the only way to clear that search) disappear along with the rows.

## Server-side search: what changed, and what didn't

Businesses and Users used to load their entire list once and filter it in the browser via a shared
`useSearchFilter` hook (deleted once both screens moved off it — see [Admin
Management](../backend/admin-management/overview.md#server-side-search-why-and-why-the-two-lists-needed-different-sql)
for the backend side of that move). Two design choices worth calling out for the next screen that
needs the same treatment:

- **Pagination stayed client-side.** The list endpoints still return every matching row unbounded;
  `usePagination` (`apps/web/src/hooks/common/use-pagination.ts`) still slices the array for
  display. Only the *filtering* moved server-side. This was a deliberate scope decision, not an
  oversight — see [Admin Management's own known
  limitation](../backend/admin-management/overview.md#known-limitations) for when that stops being
  enough.
- **The webhook-activity and platform-activity-log screens went further**, because their backend
  endpoints already returned a real `{ data, meta }` pagination envelope before this session's
  work started — those two hooks fetch exactly the page being displayed via `page`/`pageSize`, the
  same shape `useReviewQueue` established first. Don't conflate the two patterns: a screen backed
  by a bare-array endpoint paginates client-side over server-filtered results; a screen backed by a
  `{ data, meta }` endpoint paginates server-side too.

## Where each pattern actually lives

| Hook | Search | Pagination | Filter |
|---|---|---|---|
| `use-review-queue.ts` | Server, debounced | Server | Server (status, classification) |
| `use-admin-businesses.ts` / `use-admin-users.ts` | Server, debounced | Client (`usePagination`) | — |
| `use-admin-billing-webhook-events.ts` | — | Server | Server (`type`) |
| `use-admin-platform-activity-log.ts` | — | Server | Server (`type`) |
