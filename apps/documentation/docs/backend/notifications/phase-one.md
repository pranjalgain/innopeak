---
sidebar_position: 3
---

# Notifications — Phase One (In-App Only)

## Purpose

Phase one delivers **in-app notifications only**: the bell icon in the dashboard header, fed by the
`in_app_notifications` table. Email and Microsoft Teams delivery, and the Settings screen that picks
between them, are **not** part of phase one. This page is the design for that scope and for the
platform setting that keeps the unfinished parts switched off.

It builds on the [Notifications Module overview](./overview.md), which describes the two products
(the delivery ledger in `notifications` and the in-app feed in `in_app_notifications`). Phase one
touches only the feed.

## What exists today

Verified against the code on `development`:

- The in-app feed has **read endpoints only**: list, mark one read, mark all read and unread count
  (`apps/backend/src/api/notifications`). **Nothing writes to `in_app_notifications`.** A review that
  is escalated, a draft that needs approval, an approved reply or a broken connection produces no
  notice.
- Nothing sends email or Teams messages for notifications. The `notification_recipients` table is
  written once at signup (the owner is added) and otherwise only read and edited by the
  **Settings → Notifications** tab, so that tab controls nothing yet.
- The bell loads its list once. Queries are cached for five minutes and the page only refetches on
  window focus after an error, so even a notice that did exist would not appear until a reload.

## The platform setting

Whether tenants see notification preferences is a **platform-admin decision**, stored with the other
deploy-wide switches (`microsoft_login_enabled`, `invite_members_enabled` and so on) on the single-row
`platform_settings` table.

| Item | Value |
|---|---|
| Column | `notification_settings_enabled BOOLEAN NOT NULL DEFAULT false` |
| Migration | Edited into `0008_platform_settings.sql` in place (migrations are not released yet), then `pnpm db:migrations:lock` and `pnpm db:introspect` |
| Existing databases | Reset the local database. No forward migration |
| Admin write | `PATCH /v1/admin/settings/platform-config`, field `notificationSettingsEnabled` (audited like the other fields) |
| Public read | `GET /v1/settings/platform-config`, field `notificationSettingsEnabled` |
| Admin UI | A switch in Admin → Settings → Platform (`platform-section.tsx`), English and German copy |

The default is `false`, the opposite of `invite_members_enabled`: a fresh deploy shows no
preferences screen.

### Enabling is refused while channels are not implemented

Email and Teams delivery do not exist, so turning the setting **on** would show tenants controls for
channels that never deliver. Until they exist, the admin write rejects `true`:

- Status **422** with the error code `NOTIFICATION_CHANNELS_NOT_IMPLEMENTED` and a message in English
  and German ("Email and Teams notifications are not implemented yet."). A 4xx is deliberate: the API
  logs 5xx at error level with a stack trace, and an expected refusal should not read as an incident.
- `false` is always accepted, so the switch can be left off and an existing `false` is not an error.
- The web admin screen shows the server's message in the admin's language when it gets this 422,
  instead of the generic "could not save".
- The check lives in one place in `admin-settings.service.ts`, marked with a `TODO` that names it.
  **Removing that single check is what turns the feature on** once at least one extra channel is
  built.

Everything behind the setting is still built and tested now, so removing the check is the only step
left:

- **Recipients API gate.** `GET` and `PATCH` on the notification-recipients routes return a clear
  4xx (English and German) while the setting is off, the same way member invites check
  `inviteMembersEnabled`.
- **Settings tab.** The Notifications tab and its section render only when
  `platformSettings.notificationSettingsEnabled` is true, like the Members tab. An old
  `?tab=notifications` link falls back to General, and the recipients are not fetched while the
  setting is off.
- **Settings load.** There is no backend aggregate; the web Settings screen assembles its data from
  several calls. While the setting is off it does not request the recipients at all (it reads the
  setting from the shared platform-settings cache and uses an empty list), because the recipients
  route answers 403 and would otherwise fail the whole Settings load. The Settings data is cached for
  five minutes, so a tenant who already has Settings open sees recipients after a reload once an
  admin turns the setting on.

## In-app producers

Four events create a feed entry. They map to the existing `in_app_notification_type` values.

| Event | Type | Where it is raised |
|---|---|---|
| A review is classified as escalated | `review_escalated` | The classification step (`review-classification.service.ts`) |
| An AI draft is saved and will not auto-post, including escalation snippets | `reply_needs_approval` | `ai-reply-generation.service.ts` |
| A reply is approved by a person, or auto-approved | `reply_approved` | `reviews.service.ts` (approval) and the auto-post path |
| A connection needs reconnecting | `connection_issue` | Every `markNeedsReauth` call (review sync, review post, connect) |

### Who receives a notice

**Every active user of the tenant.** There is no preference screen in phase one, so nobody is
silently left out. Disabled, invited and pending users are skipped. For `reply_approved` the person
who approved the reply is skipped (they just did it); an auto-approval notifies everyone.

### How a notice is created

- **One service, called directly.** `InAppNotificationsService.publish(tenantId, events)` (service,
  DB service and repository, per the layering in `apps/backend/CLAUDE.md`) turns events into rows. It
  lives in a `@Global()` module registered in both the API and the worker, because the producers run
  in either process. It was designed as a queue job, but a notice is a single insert against the same
  database the pipeline has just written to, so a separate queue would only add a failure mode (and a
  new queue, SQS mapping and dead-letter wiring) for no gain. If batching or retry ever matters, only
  `publish` changes.
- **Recipients.** Every active user of the tenant: `status = active`, not anonymized, no erasure
  requested. For an approval by a person the approver is skipped; an auto-approval has no author and
  tells everyone.
- **Bursts are folded.** Producers call `publish` once per run (a classification run, an AI-drafting
  batch), and more than five events of one kind in a call become the first five plus one summary
  notice ("7 more reviews escalated"). Without this the first backfill of a business, which can
  escalate or auto-reply to dozens of old reviews, would bury the bell. Connection issues are never
  folded.
- **One multi-row insert per call**, in chunks of 500, `ON CONFLICT DO NOTHING`. The existing unique
  index on `(user_id, type, review_id, generation_group_id)` stops a repeated notice for the same
  review and group. `connection_issue` rows have no review, so each incident is a new notice by
  design; to keep that to one per incident, `markNeedsReauth` now reports whether it actually moved
  the connection into `needs_reauth`, and only that caller announces it.
- **Best-effort.** `publish` never throws: a failed insert is logged and dropped, so a notice can
  never fail the review pipeline or the request that raised it.
- **Wording.** The title and description are stored on the row (frozen, so a later wording change
  never rewrites history). They are rendered in the recipient's own locale (`users.locale`, falling
  back to English) at creation time, from the English and German message catalogs. A recipient who
  later switches language keeps the old rows in the language they were written in; this is an
  accepted trade-off of storing rendered text.
- **Unaffected by the setting.** In-app notices are created whether or not
  `notification_settings_enabled` is on; in-app is the baseline.

## Real-time delivery

### Step one: polling (in the first PR)

Implemented in `useNotifications`. After the feed's first load (no extra request at mount), a visible
page asks the server every 45 seconds for the whole-feed unread total, using a one-row page as the
cheapest read. Only when that total is higher than what the feed shows is the feed itself refetched,
so an idle tab costs one tiny request per interval. Polling does not run in a hidden tab; showing the
tab or focusing the window checks straight away (at most once per 10 seconds). A failed poll is
ignored and the next interval tries again. It needs no new infrastructure and stays as the fallback
if a stream drops.

### Step two: server-sent events

One-way push over server-sent events (SSE), with Redis pub/sub carrying the news from the worker
process (where producers run) to the API process (where browsers are connected). There are **two
separate subscriptions**, and the browser never talks to Redis:

| Hop | Who subscribes to whom | Technology |
|---|---|---|
| Worker to API | Each API replica subscribes to a Redis channel | Redis pub/sub |
| API to browser | The browser opens a stream to the API | SSE over plain HTTP |

#### How a stream works

SSE is **one long HTTP response**. The browser makes one GET request, and the API answers with
`Content-Type: text/event-stream` and then does **not finish the response**; it writes more bytes
onto it whenever there is news. Nothing is installed in the browser, no permission prompt appears and
no third party is involved. The API never opens a connection to the browser and needs no address for
it: the connection is opened from the browser (outbound, like any page load), and the API can only
write on connections that exist. On the wire:

```text
Browser to API   GET /v1/notifications/stream   (session cookie)
API to browser   200 OK, Content-Type: text/event-stream   (response left open)
API to browser   id: 0190c1001a
                 event: notification
                 data: and the notification id as JSON
                 (a blank line ends the event)
API to browser   : heartbeat   (a comment line, ignored by the browser)
```

#### Flow

1. After the worker writes a notice to Postgres, it publishes the `userId` and `notificationId` to a
   Redis channel. Events carry **ids only, never content**.
2. The API holds one Redis subscriber and an in-memory map of open streams per user. When a message
   arrives it finds that user's open responses (if this replica holds any; otherwise it ignores the
   message) and writes one event to each.
3. The browser's `EventSource` parses the event and runs the listener. The listener fetches the full
   notice through the normal authenticated endpoint, adds it to the `["notifications"]` cache and
   bumps the unread count. The bell shake reacts to that count going up. A toast for the urgent types
   (escalated review, connection issue) is optional.
4. Heartbeat every 25 seconds and `X-Accel-Buffering: no`. The server sends `ready` on connect,
   `notification` (with the notification id) for each new notice and `heartbeat` while idle. There is
   no server-side replay: after any reconnect the browser refetches the feed once, which catches up
   on whatever it missed while down (the feed in Postgres is the source of truth, and refetching is
   simpler and bounded where replaying from `Last-Event-ID` would need a per-user event log).
5. The 15-minute access token ends the stream. The client makes one cheap authenticated read (the
   request layer renews the session itself if the token really expired) and reconnects after a
   randomised delay.
6. If Redis is down the stream goes quiet and polling covers it. Postgres is the source of truth;
   Redis pub/sub is at-most-once and only says "something new, fetch it".

#### Backend and frontend shape

On the backend, the stream route returns a per-user feed and the Redis subscriber pushes into it:

```ts
@Sse("stream")
stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
  return this.notificationStream.forUser(user.id); // response stays open until the client leaves
}

redis.on("message", (_channel, message) => {
  const { userId, notificationId } = JSON.parse(message);
  this.notificationStream.push(userId, { id: notificationId, type: "notification" });
});
```

On the web, one hook in the dashboard shell owns the connection:

```ts
const source = new EventSource("/v1/notifications/stream"); // sends the session cookie

source.addEventListener("notification", (event) => {
  const { id } = JSON.parse(event.data);
  // fetch the notice, add it to the ["notifications"] cache, bump the unread count
});
```

`EventSource` reconnects by itself and sends `Last-Event-ID`; on an error caused by an expired
session the hook makes an authenticated read first, which renews it. The stream opens **once per browser, not once per
tab**: one tab holds it and passes events to the others over `BroadcastChannel`, because browsers
limit connections per site.

#### What it is not

This is not web push. There is no service worker, no "allow notifications" prompt and no push
provider such as Firebase. It only works while the app is open; a notice that arrives with no tab
open is in Postgres and appears in the bell the next time the app loads. Alerts with the app closed
are a separate feature (see [Not in phase one](#not-in-phase-one)).

#### Hardening for open connections

The stream adds one route behind the same session cookie, CORS rules and tenant checks as the rest
of the API. What changes is the kind of load: a held connection per user instead of short requests.

| Risk | What could go wrong | Handling |
|---|---|---|
| Connection exhaustion | Many open streams use up sockets and memory, or someone opens thousands on purpose | At most three streams per user, authentication before anything is held open, a per-IP limit on opening streams, a connection ceiling per replica, and more replicas as it nears the ceiling |
| Leaks | A closed tab never frees its entry and memory grows | Remove the entry on the response `close` event, and treat a failed heartbeat write as a dead connection |
| Idle timeouts | Proxies and load balancers close quiet connections | Heartbeat every 25 seconds, `X-Accel-Buffering: no`, and an ingress idle timeout above the heartbeat |
| Expired access | A stream stays open on a session that has ended | Close the stream when the access token expires; a disabled user fails the next check as for normal requests |
| Data between users | One user receives another's event | Key events by the user id from the verified token, never the URL; events carry ids only and content is fetched through the tenant-checked API |
| Deploys | Restarting drops every stream | Close streams on shutdown; clients reconnect after random delays |
| Rate limiting | The global limiter counts a long request wrongly | Opening the stream counts once; heartbeats and events are not requests |

#### Timeouts and stream lifetime

A stream does not need to stay open for any particular time. Several layers close it, and the design
treats closing as normal: the client reconnects and catches up from Postgres, so the user never
notices.

| Layer | Typical limit | What we do |
|---|---|---|
| Our session | The access token lives 15 minutes | The server closes the stream when the token expires, so a stream lasts at most about 15 minutes. The client reconnects (renewing the session only if it really expired). This also ends the stream of a disabled or signed-out user quickly |
| Proxies and load balancers | Idle timeouts, commonly 60 seconds (nginx read timeout, AWS ALB idle timeout), 100 seconds on Cloudflare | A heartbeat comment every 25 seconds keeps the connection active, and the ingress idle timeout is set above that (about 120 seconds) |
| Node HTTP server | No response timeout by default | Nothing to change; check that `server.timeout` is not set low |
| Browser | `EventSource` has no time limit | Nothing. A background tab can pause timers and a sleeping phone can drop the connection, which the reconnect handles |
| Our own cap | A safety net, not a requirement | A hard maximum lifetime of about 30 minutes in case a token is long-lived, which also rebalances streams across replicas over time |

Starting values: heartbeat every 25 seconds; ingress idle timeout 120 seconds or more; stream
lifetime until the token expires, capped at 30 minutes; client reconnect after a random 1 to 5 second
delay, backing off to 60 seconds while the server is down, with a `retry:` hint from the server so
browsers do not hammer it.

Cost of the periodic closing: with 5,000 connected users and streams ending about every 15 minutes,
that is roughly 5 to 6 new connections per second across the fleet, spread out by the random delay,
which is far less than ordinary page traffic.

The ingress idle timeout and response buffering (`X-Accel-Buffering` or the equivalent for the
ingress in use) are infrastructure settings, so they are a devops item to agree before step 5 ships.

Operationally this means watching open stream count and memory per replica, and setting the ingress
to allow long responses. A load test with a few thousand streams is part of step 5 before it ships.
If streams ever hurt normal API traffic, they can run as their own small deployment.

#### As built

- **Backend** (`src/api/notifications/realtime/`): `NotificationEventBus` publishes ids to the Redis
  channel `notifications:events` (in the worker and the API, 500 ms timeout, 200 users per message,
  never throws); `NotificationStreamService` holds one Redis subscriber and the open streams of this
  replica; `GET /v1/notifications/stream` (`@Sse`, tenant users only) opens one. The publisher runs
  after the rows are inserted and only for rows actually written. Limits: 3 streams per user (the
  oldest is closed), 5,000 per replica (then 503, and the client falls back to polling), a stream
  ends when its access token expires and never lives past 30 minutes.
- **Transport details.** The `compression` middleware skips `text/event-stream` (it would buffer
  events), and the response envelope interceptor skips the route. The route is not in the generated
  client, since `EventSource` is a browser API.
- **Web** (`use-notification-stream.ts`): one stream per browser, owned by the tab holding a Web Lock
  and relayed to the other tabs over a `BroadcastChannel` (without Web Locks every tab opens its own);
  reconnects with an exponential, jittered backoff after one authenticated read (which renews the session only if it expired); while a stream is up
  the 45-second poll slows to 3 minutes and remains as the backstop. A pushed notice just refetches the
  feed, so the unread count rises and the bell shakes exactly as it does for a poll.
- **Rate limiting.** Opening a stream counts as one request against the normal per-IP limits, like any
  call; it happens at most once per browser per token lifetime.

#### Hardening found in review

- **Boot.** The Redis subscription is not awaited at startup: the shared client waits forever for a connection that is down, so awaiting it held up `app.listen()`. The API now boots and serves with Redis unreachable (live probe 200, readiness 503) and the stream subscribes when Redis returns.
- **No lost notices.** Classification and AI drafting publish in a `finally`, so a failure partway through a batch (a rejected claim, a killed worker) no longer drops the notices already earned; a classified review is never revisited.
- **Auto-approve outcomes.** A draft that was already decided, superseded or has a live reply when the auto-approve ran needs no approval and raises no "needs approval" notice; only a draft left pending by a failed auto-approve step does.
- **Real de-duplication.** NULLs are distinct in the unique index, so only notices with both a review and a generation group were ever protected. An escalation now carries a fixed group per review, so a re-run is a no-op; the other types are at-least-once and rely on being called once per event.
- **Atomic insert.** The chunks of one `insertMany` run in a single transaction, so a failure never leaves half a tenant-wide notice, and nothing is published for rows that were not kept.
- **Paths and eviction.** The response-envelope interceptor skips any `@Sse` handler (read from the handler's metadata, not the URL, so case, a trailing slash or a prefix cannot matter), the compression filter also checks the response's `Content-Type`, and a user reconnecting at their own cap is not refused by a full replica (their old stream frees the slot).
- **Slots cannot leak.** A stream's slot is taken when it is opened and given back by the teardown of its subscription. If the request dies in between (so Nest never subscribes), the slot expires after 10 seconds unclaimed instead of counting against the per-user and per-replica caps until a restart.
- **Lifetime policy in the service.** The controller binds the request and calls `NotificationStreamService.connect`, which decides the stream's life from the access token (controllers hold no computation).
- **Reconnects do not refresh tokens.** A reconnect used to call the refresh route every time, so a deploy sent every browser there at once and the route is throttled per IP. It now makes one read through the normal request layer, which refreshes (once, shared across tabs) only when the token expired.
- **Approvals do not wait.** `ReviewsService.approveReply` starts the team announcement without awaiting it, so the person approving never waits for the recipient lookup, the insert or Redis. It never rejects.
- **Summaries and the approver.** A folded summary skips a person only when every event folded into it was their own approval; otherwise it goes to everyone.
- **Retention purge.** The nightly purge deletes in batches of 5,000 (each its own short transaction) and is served by two age indexes, `idx_in_app_notifications_created_at` and a partial `idx_in_app_notifications_read_at`; the per-user indexes cannot serve a filter on age.
- **Upgrading a database that ran the earlier migrations.** Before the first production release the migrations are edited in place (see the repository `CLAUDE.md`). This branch changes `0008_platform_settings` (renamed and added columns) and `0005_notifications` (two indexes) in place, and Drizzle never re-reads an applied file, so any database that already ran them (a shared development database or a teammate's) must be reset, or at minimum `0008` re-applied by hand, before this branch runs against it. After the first release every change is a new numbered migration.
- **Web.** The stream owner has a watchdog (no event for 60 seconds means dead, reconnect), a reconnect or takeover refetches the feed and tells the other tabs, polling keeps a steady cadence instead of restarting when the stream flaps, and the bell ignores a failed first load, a repair after a failed mark-as-read, and held notices that were cleared or seen meanwhile.

#### Verified

- **Through the Next rewrite.** A production build of the web app forwarding `/v1` to the API delivers
  `ready` immediately and each event the instant it is published (3.22 s after opening, when it was
  published at 3.22 s), chunked and uncompressed, even when the client asks for gzip. The stream does
  not need to bypass the rewrite.
- **End to end.** The producing service in a separate process writes the rows, publishes to Redis,
  and the open stream of each recipient (and only that user) receives the event with the real id.
- **Load test** (1,500 concurrent streams against one API process, local): all opened in about 2.4 s
  with no errors; one fan-out publish reached all 1,500 with p50 49 ms and p99 71 ms; memory grew about
  100 MB for the first 1,500 (about 70 KB per stream, including client buffers) and a second round
  added only about 10 MB, so nothing leaks. At the 5,000 per-replica ceiling that is on the order of
  350 MB.

## The bell shake

When new notifications arrive while the page is open, the bell icon shakes like a buzzing bell.

- **Trigger.** The unread count goes **up** while the page is mounted. It is driven by the data, so
  it works the same for polling and for the stream.
- **No shake** on the first load or a page refresh, when the count goes down (marking read), or while
  the popover is open. A notice that arrives in a hidden tab is held and plays when the tab becomes
  visible. Back-to-back notices restart the animation.
- **Animation.** A damped swing of about plus and minus 14 degrees settling over roughly 0.8 seconds,
  pivoting from the top centre, plus a one-off pulse on the badge. A `bell-ring` keyframes rule and
  utility class in `globals.css`, following the existing `progress-sweep` pattern. No sound.
- **Reduced motion.** With `prefers-reduced-motion` there is no shaking; the badge flashes briefly
  instead.
- **Screen readers.** A visually hidden polite live region announces "1 new notification" or "N new
  notifications", in English and German.
- **Code.** A small hook, `useBellRing(unreadCount)`, keeps the previous count in a ref and returns
  `ringKey` and `isRinging`; `NotificationPanel` applies the class to the bell icon.

## Scaling

For this product a tenant is a small business with a few users, so phase one stays cheap for a long
time. The first pressure is polling and open streams, not the database.

| Pressure | What happens | Response |
|---|---|---|
| Polling | Thousands of tabs polling every 45 seconds | Once the stream exists, poll only as a slow fallback (2 to 5 minutes) while it is connected. The count is an index-only read on the unread partial index |
| Open streams | Each stream holds a socket | Scale API replicas by connection count, cap streams per user, share one stream across browser tabs, and move streams to their own deployment if they hurt normal API traffic |
| Reconnect storms | A deploy drops every stream | Randomised client backoff and a bounded catch-up read |
| Pub/sub fan-out | With one channel every replica receives every event | Fine at thousands of events per second since payloads are ids only; beyond that shard channels by `hash(userId) mod N` or use Redis 7 sharded pub/sub |
| Table growth | `in_app_notifications` grows without bound | A daily purge (`notification-retention-purge` at 03:30: read notices after 90 days, any notice after 180). Keyset pagination on the existing `(user_id, created_at, id)` index is the next step if a single user's feed ever gets deep; offset paging is already bounded. Partition by month only at very large sizes |
| Write amplification | One event becomes one row per user | One multi-row insert per call, bursts folded into a summary, repeats safe through the unique index |
| Large tenants | A business with hundreds of users gets noisy | Coalesce into one notice per type per window; per-user preferences come back through the settings tab |
| Email and Teams later | Provider limits and retries | A separate delivery queue on the existing `notifications` ledger, with per-provider limits, backoff and digests |

Built in from the start so later scaling is configuration: ids-only events, notice creation behind
one service (so batching, retry or a queue can be added in one place), the retention job shipped with the producers, and
metrics (queue depth, publish-to-delivery lag, open streams, notices written per minute). If concurrent
users reach the hundreds of thousands, the transport can move to a dedicated gateway or a managed
service without touching the database design.

## Delivery plan

| Step | Content |
|---|---|
| 1 | This page, then review |
| 2 | The `platform_settings` column, the admin toggle with the not-implemented error, the recipients gate and the tab gating |
| 3 | The in-app producers: writer service, four triggers, burst folding, retention job |
| 4 | Polling on the web, with the bell shake |
| 5 | SSE with the Redis fan-out, once-per-browser stream sharing, hardening and a load test |

All five steps are implemented. The ingress idle timeout and response buffering for the stream are
the one devops item left to agree (see Timeouts above).

## Testing

- Backend unit tests for the setting (read, admin write, the 422 refusal), the recipients gate, each
  producer, the recipient rule and the dedupe.
- Web tests for the admin switch, the hidden tab and the fallback from `?tab=notifications`, the
  polling interval and `useBellRing` (no ring on first render, a ring on an increase, none on a
  decrease or while the popover is open, held while hidden, restart on a second notice, reduced
  motion).
- Both locale files stay in sync (`apps/web/messages` and
  `apps/backend/src/common/i18n/messages.{en,de}.ts`).
- A live check with the setting off, and a check that enabling it returns the 422.

## Not in phase one

- Email and Microsoft Teams delivery, and the per-user channel preferences screen that uses them.
- Digest and coalescing beyond what the producers need to stay quiet.
- Sound, browser push (service worker and permission prompt) and mobile push. The in-app stream installs nothing and only works while the app is open; alerts with the app closed would build on the same notification rows.
