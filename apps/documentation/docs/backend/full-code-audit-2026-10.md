# InnoPeak backend and web: consolidated audit report

## 1. Summary

Read-only audit by 10 module agents plus cross-module claims and replies. There are no critical findings. Totals after merging duplicates and applying replies: 1 high, 33 medium, 50 low (84 findings).

| Module (primary owner) | High | Medium | Low | Total |
|---|---|---|---|---|
| ai-prompts-misc | 1 | 3 | 2 | 6 |
| admin-settings | 0 | 5 | 6 | 11 |
| auth | 0 | 3 | 4 | 7 |
| background | 0 | 7 | 6 | 13 |
| billing | 0 | 4 | 4 | 8 |
| connections-reviews | 0 | 5 | 4 | 9 |
| db | 0 | 1 | 4 | 5 |
| platform | 0 | 3 | 8 | 11 |
| web-tenant | 0 | 2 | 7 | 9 |
| web-admin | 0 | 0 | 5 | 5 |

**Dropped:** background-1 (the claim that no @Cron job ever fires). Its author retracted it and I confirmed the wiring. CronModule imports AuthModule, which imports QueueUIModule, which imports CronUIModule, and that provides CronScheduler. ScheduleModule.forRoot() is only in CronModule, so only the worker fires the schedules.

**Spot-checked in code (all reproduced):**
- ai-prompts-misc-1
- the quota counter (reviews-read.repository.ts:377)
- toggleActive (admin-users.repository.ts:107-114)
- bodyParser.urlencoded (bootstrap.ts:120)
- the Bull Board guard (no isRevoked call)
- the http-exception.filter logging
- the queue-transport registerQueue without options
- the unguarded standalone-member loop (cron.service.ts:222-233)

---

## 2. Critical and high

### HIGH-1 (ai-prompts-misc-1; also x-ai-bg-1, background-6): GDPR anonymization swallows a failed avatar delete, then anonymizes anyway
- **Where:** apps/backend/src/api/media/media.service.ts:63. Callers are api/auth/services/account-anonymization.service.ts:18-19 and background/cron/cron.service.ts:~175-235.
- **Verified:**
  - deleteAvatarIfPresent catches any storage error other than StorageAssetNotFoundError, logs a warning and returns, so the media row is not removed.
  - AccountAnonymizationService.anonymizeUser then runs authDbService.anonymizeUser unconditionally, which sets anonymized_at.
  - The "not anonymized" selectors skip that user from then on, so nothing retries.
  - The tenant loop's catch at cron.service.ts:~192 exists to skip and retry on an avatar failure, but it never fires because the error is swallowed. The tenant is marked erased and the "erased" notice is sent while the photo is still on a public Cloudinary URL.
  - The JSDoc ("leaves the row for a retry") and the comment in AccountAnonymizationService describe behaviour that does not happen.
  - The same path runs when CLOUDINARY_* is unset or Cloudinary is down or rate-limited.
- **Fix:**
  1. Rethrow after the warn and keep the media row.
  2. Add a per-user try/catch in the standalone-member loop (cron.service.ts:222-233). It has none today, so one failing user aborts the rest and suppresses the notifyPurgeSkipped alert.
  3. Add a spec where storage.delete rejects and anonymizeUser must not run.
  - Fix the loop first. Reply x-ai-bg-1 confirmed that the loop's missing catch is already reachable today through any DB error.

---

## 3. Medium and low

### Medium

| # | Id(s) | Modules | File:line | Issue | Fix |
|---|---|---|---|---|---|
| M1 | ai-prompts-misc-2, db-1, billing-9 | ai, db, billing, connections-reviews | db/repositories/review-sync/reviews-read.repository.ts:370-377 | The monthly AI-draft quota counts only source='ai_generated'. approveReply rewrites an edited draft to 'human_edited', so editing frees a slot. The Free cap of 20 is not enforced, LLM spend is uncapped, and billing usage is understated. | Count `original_content IS NOT NULL` or `source IN ('ai_generated','human_edited')`. Keep findClassifiedNeedingGeneration's NOT EXISTS consistent. The "edited draft gets re-drafted" variant was refuted: a review with a response never returns to 'new'. |
| M2 | admin-settings-3, db-2, background-15 | admin-settings, db, background | admin-users.service.ts:73; 0009_admin_overview.sql:25-43; auth.repository.ts:1131 | platform_activity_log keeps actor_email, target_email and business_name forever. No job scrubs or purges it, and the CHECK requires target_email NOT NULL. | On anonymize or erase, rewrite the matching emails to a placeholder such as '[erased]', which satisfies the CHECK. Add a retention job. Pre-release, edit 0009 in place. |
| M3 | db-3 | db, background | auth.repository.ts:1487; cron.service.ts purge | An "erased" tenant keeps review_text, reply content, location name/address/phone, tenant name, blocklist, prompt templates, notifications and connection rows. Only users and reviewer name/id are scrubbed. | Decide what "erased" means. Either delete or null the free-text columns in the purge step, or document the retention basis. |
| M4 | connections-reviews-1, db-4 | connections-reviews, db, web-tenant | connections.db-service.ts:210; connections.repository.ts:260-271 | user_locations is filled only for the confirming owner. listLocations inner-joins it, so second owners get an empty list. | Use findLocationsByTenant, or attach all active users on confirm and invite acceptance. See cross-talk for the narrower web impact. |
| M5 | admin-settings-4, db-9, web-admin-1, web-admin-2, auth-9, web-admin-x2 | admin-settings, db, web-admin, auth | admin-users.repository.ts:107-114; admin-user.service.ts:27 | toggleActive is a blind, non-idempotent flip. A stale 5-minute list or a double click re-enables a deactivated user. For an INVITED member, toggling twice gives PENDING_VERIFICATION. Invite acceptance and revocation require status='invited', so the invite is dead and the address is stuck. | Take an explicit target (`{ enabled }`). Refuse INVITED rows, or restore 'invited' when email_verified_at and password_hash are null. Return changed:false on a no-op. Derive the audit and revoke direction from the same UPDATE ... RETURNING (web-admin-x3 confirmed). |
| M6 | auth-7 (new, from the x-wt-4 reply) | auth, web-tenant, web-admin | bootstrap.ts:120 | The global urlencoded parser, with no Origin check, lets a cross-site auto-submitted form POST to public routes such as /v1/auth/login or /accept-invite. The Set-Cookie response replaces the victim's session (login CSRF). Cookies are Lax httpOnly, which blocks authenticated CSRF but not this. | Remove bodyParser.urlencoded so routes are JSON-only and need a preflight. Optionally reject state-changing requests with a foreign Origin or Sec-Fetch-Site. |
| M7 | platform-1 | platform, auth | middlewares/dev-tool.middleware.ts:94 | The Bull Board guard never calls SessionRevocationService.isRevoked. A logged-out or password-changed admin's token still opens /admin/queues for up to 15 minutes. Queue payloads hold OTPs and invite links. platform-x1 confirmed it is the only such bypass. | Resolve `SessionRevocationService` with `app.get(..., { strict: false })` and call `isRevoked({ userId, issuedAt: iat })`. |
| M8 | platform-2, db-11 | platform, db | http-exception.filter.ts:43-47 | DrizzleQueryError.message includes the SQL and all bound params. The filter logs it, so password and token hashes, emails and review text reach the logs. No repository strips them (platform-x5 confirmed). | Detect DrizzleQueryError (or `.query`/`.params`) and log only the cause's code, constraint and table. Strip `\nparams:`. |
| M9 | platform-4 | platform | bootstrap.ts:144; error-handler.service.ts:145,220 | Swagger, pg-error detail and body logging key on NODE_ENV only. A public staging box (NODE_ENV=development) exposes them. | Gate on isLocalDevelopment() or an explicit flag. |
| M10 | background-2 | background | email.processor.ts:128 (and all processors' onStalled) | A job stalled past maxStalledCount is moved to failed without a 'failed' event, so DLQ forwarding and email payload scrubbing never run. Raw OTP and invite links stay in Redis for 7 days. | Handle it via a QueueEvents 'failed' listener, or look up the job in onStalled. Not re-verified by me; it rests on bullmq 5.58.6 internals. |
| M11 | background-3 | background | background/providers/queue-transport.module.ts:36 | `BullModule.registerQueue({ name })` has no options, and all producers publish through it. The per-queue defaults (attempts 1, removeOnFail) are never applied. Review-post jobs are blindly retried, onFailed forwards to the DLQ up to 3 times, and failed email jobs keep their OTP payload for 7 days. | Reuse the per-queue registrations or pass the same defaultJobOptions per queue. Gate the onFailed DLQ forward on the final attempt. |
| M12 | background-4 | background | sqs-queue-consumer.base.ts:56 | The poll loop retries immediately on any receive error: a hot loop and log flood. JSON.parse sits outside the inner try. | Add capped exponential backoff and move the parse inside handleMessage's try. |
| M13 | background-5 | background | sqs-queue-consumer.base.ts:78; infra/floci/sqs.tf | No visibility heartbeat against a 60 s timeout. The erasure purge and the poll fan-out outlive it, so jobs run twice and successful work is redriven to the DLQ. | Extend visibility during processing or raise the timeout per queue. |
| M14 | background-6, ai-prompts-misc x-ai-bg-1 | background, ai | cron.service.ts:222-233 | The standalone-member loop has no try/catch. One failure aborts the purge and suppresses the skipped-tenant alert. | Wrap each member, record it as skipped, alert after the loop and order the due users deterministically. Part of HIGH-1. |
| M15 | billing-1 | billing | billing-webhooks.service.ts:171; stripe-payment.provider.ts:413-414 | checkout.session.completed overwrites the subscription period with NULL. billing-reconciliation resumes on a NULL period end. | Omit or COALESCE the period in the webhook path, and treat NULL as unknown on resume. |
| M16 | billing-2 | billing | billing-webhooks.service.ts:167 | A newer unrelated event advances the event clock, so a retried checkout.session.completed is dropped as stale. The tenant paid but stays Free. | Apply the plan and subscription binding when the row has no subscription id, and gate only status and period by the clock. |
| M17 | billing-3, billing-x3 | billing, background | billing-reconciliation.service.ts:183 | The reconcile and sweep write Stripe snapshots with no event clock or lock, so they can resurrect Paid after customer.subscription.deleted. The only callers are cron.service.ts:280 and billing.service.ts:204. | Stamp the clock at the Stripe read time, or take a per-tenant lock and re-read. |
| M18 | billing-4, admin-settings-13, billing-x4 | billing, admin-settings | billing-reconciliation.service.ts:62-70; admin-businesses.service.ts:137; account-deletion.service.ts:121 | Erasure cancellation skips a tenant with no recorded subscription id. A failure is only warned, with no retry, so billing continues during the grace period (up to ~21 days). | Look the live subscription up via the customer id, or cancel when the checkout webhook lands for a tenant with pending erasure. Persist a retry marker. |
| M19 | connections-reviews-2 | connections-reviews | reviews.service.ts:257; review-post-queue.service.ts:123-134; connections.service.ts:496 | approve and reject skip the paused-location and review-status gates. The post worker and setActiveLocation do not check the location's billing pause or status. | Resolve through findReviewForTenant plus assertReviewAcceptsReply, and check the location state in the worker and setActiveLocation. |
| M20 | connections-reviews-3, x-connections-reviews-2 | connections-reviews, background | review-sync.db-service.ts:132 | A reply written on Google after import never moves the review to responded. Drafts remain and AI quota is spent. The post job's getReviewReply check prevents overwriting the owner's reply. | In writeReviewPage, call markReviewResponded and supersede the drafts when a reply is imported. |
| M21 | connections-reviews-4, db-5, db-12, db-x3 | connections-reviews, db | connections.service.ts:229; 0003_review_provider_locations.sql:18 | No (tenant_id, provider) partial unique index, and the check is a lock-free read-then-write. Two concurrent consent flows can leave two live connections. findConnectionByTenant picks one, and erasure revokes only that one. | Add UNIQUE (tenant_id, provider) WHERE disconnected_at IS NULL and map 23505. Revoke all connections at erasure. Fix the ORDER BY so disconnected rows sort DESC. The RESTRICT-on-erasure concern was refuted. |
| M22 | connections-reviews-10, connections-reviews-9, background-x2 | connections-reviews, background | review-post-queue.service.ts:123; review-sync-queue.service.ts:161-250,260; connections.repository.ts:134 | Workers pair the location with the tenant's current connection, not the location's own, and check neither disconnected_at, location status nor billing pause. A stale job can flip a healthy connection to needs_reauth and notify the whole team. | Resolve via location.providerConnectionId and require disconnected_at IS NULL and an active, unpaused location. Add a disconnected_at IS NULL filter to markNeedsReauth. |
| M23 | ai-prompts-misc-3 | ai | ai-reply-generation.service.ts:237 | A review the model cannot answer is retried every tick, and a few poison reviews at the head (ordered by reviewed_at DESC) starve the batch. | Add an attempt counter or backoff. Do not count per-review failures towards the provider-outage breaker. |
| M24 | ai-prompts-misc-4 | ai | ai-reply-generation.service.ts:391 | Auto-post publishes raw model output derived from attacker-written review text, with no output validation. | Post-check for URLs, phone numbers, placeholders, blocklist terms and length before auto-approve. Fence review_text in the prompt. |
| M25 | web-tenant-1 | web-tenant, web-admin | apps/web/src/app/_libs/utils/sentry-options.ts:23 | scrubEvent leaves invite tokens (`/accept-invite/<token>`) and `?session_id` in `request.url`, transaction names and breadcrumbs. | Redact URL paths and query values for event URLs, breadcrumbs and tags. |
| M26 | web-tenant-2 | web-tenant | apps/web/src/app/_libs/services/auth.service.ts:291 | ensureFreshSession turns any failed refresh (429, 5xx, a dead session) into a 401. The UI shows "current password incorrect" and never redirects. | Carry the real status and call leaveLapsedSession on a real 401 only. |
| M27 | admin-settings-1 | admin-settings | auth.repository.ts:1185 | A tenant owner can reverse an admin's deactivation through request-removal then cancel-removal, which restores ACTIVE. | Refuse request-removal for already-DISABLED users, or store the prior status. |
| M28 | admin-settings-2 | admin-settings | admin-businesses.repository.ts:331 | cancelErasure hard-codes ACTIVE and silently lifts an admin suspension. | Store the pre-erasure status and restore it on cancel. |
| M29 | admin-settings-5, auth-6 | admin-settings, auth | admin-settings.service.ts:582,600; tenant-members.service.ts:203; auth.service.ts:1312; account-deletion.service.ts | Invite and OTP enqueue failures are swallowed silently, the API returns success, and the resend cooldown is already spent. | Log a warning, release the cooldown on failure, and return a deliverable flag or 503. |
| M30 | auth-1, admin-settings-6, admin-settings-x3 | auth, admin-settings | otp-attempt.service.ts:27-30,56-58; auth.service.ts:193 | The OTP attempt budget and resend cooldown are keyed only on the SHA-256 of the email, so every flow shares them. An anonymous caller (10 attempts per 600 s) can lock out the owner's set-password, the delete-account OTP and an admin's setPassword. | Add a purpose and principal scope (userId or admin id). Spend the public verify-email budget only for pending_verification addresses. |
| M31 | auth-10, background-x4 | auth, background | cron.service.ts:175; erasure-notice.service.ts | After a partial purge or an enqueue failure, the "erased" notice and reminders are lost permanently. Recipients are read before anonymization, and a retry finds none. claimErasureReminder burns the claim before sending. | Persist or enqueue recipients before the first anonymize. Unclaim on failure and log an error when a notice has zero recipients. |
| M32 | background-11 | background, db | review-sync.repository.ts:304 | upsertReview's DO UPDATE restores reviewer_name on an already-anonymized review. The purges filter anonymized_at IS NULL, so the name is never scrubbed again. | Keep the name NULL when anonymized_at is set, or drop that filter from both purge UPDATEs. |
| M33 | background-12, x-connections-reviews-1 | background, connections-reviews | review-sync-queue.service.ts:86; connections.db-service.ts:195-220 | An owner re-confirm enqueues a backfill for already-completed locations, which always walks 20 pages of Google. Polls for that location are skipped while it runs. | Short-circuit when onboardingBackfillCompletedAt is set unless an explicit re-sync is requested. |

### Low

| Id(s) | File:line | Issue and fix |
|---|---|---|
| auth-2 | auth.service.ts:367 | changePassword has no failure counting or lockout. Use LoginAttemptScope.TENANT. |
| auth-3 | token.service.ts:120; auth.db-service.ts:486 | A refresh racing logout or password change leaves a live successor refresh token. Serialize per user, or use a sessions_valid_after timestamp. |
| auth-4, connections-reviews-7, platform-11 | oauth-state.service.ts:161; connections oauth-state.service.ts:113; auth.controller.ts:371,440; connections.controller.ts:103 | A repeated query key gives an array and `state.split` throws a 500 on public callbacks. The reported `state[]=` repro does not work: Express 5.2.1 defaults to the "simple" query parser. Accept only `typeof === 'string'`. |
| auth-5 | auth.constants.ts:20 | The 72-byte password message has no German. Add a PATTERN_RULES entry. |
| admin-settings-7 | admin-settings.service.ts:499 | A Google-only admin blocks the Google switch-off, although admin Google login ignores that switch. Drop the guard or honour confirmLockout. |
| admin-settings-8 | admin-settings.service.ts:381-397 | A repeat enable or disable still writes an activity row, and the returned invitedAt is fabricated. Return a changed flag. |
| admin-settings-9 | admin-businesses.repository.ts:283 | requestErasure lacks the gdpr:tenant-erasure advisory lock, so it can race the purge. Wrap it in acquireResourceXactLock. |
| admin-settings-10 | list-admin-users-query.dto.ts:20 (+3 DTOs) | page has no @Max, so a huge page becomes a 500. Add @Max. |
| admin-settings-11 | notification-recipients.repository.ts:33,73; tenant-members.service.ts:128 | English-only literals ("Removed team member", "your team"). Move them to MESSAGES with en and de. |
| admin-settings-12, auth-x1 | admin-users.service.ts:60; tenant-members.service.ts:165 | Deactivation and removal revoke only the Redis access-token mark, not refresh tokens, so re-enabling revives the old session. Call revokeAllRefreshTokensForUser. The access-token side is covered on every path. |
| platform-3, platform-x3 | env-config.schema.ts:37; local-environment.util.ts:29 | isLocalUrl(unset) is true. This fails open only for a non-production deploy that also sets DEV_VERIFY_EMAIL_TOKEN with FRONTEND_URL blank. Downgraded from medium. Treat a blank URL as non-local and require FRONTEND_URL in production. |
| platform-5 | update-notification-recipient.dto.ts:26 | isActive lacks parseBooleanInput, so "false" becomes true. |
| platform-6 | health.controller.ts:31 | Public readiness is unthrottled and runs DB and Redis checks per request. Cache it. |
| platform-7, platform-x4 | bootstrap.ts:111 | The Stripe raw parser has a 100kb limit. Handled event types are small, so this is hardening only. Set an explicit limit. |
| platform-8, platform-x2 | env-config.schema.ts:93 | GBP_STATE_SECRET has no minimum length and a public literal fallback outside production. The cross-tenant state forgery was refuted, because the state is Redis-bound. The residual is the AES key for the pending-account blob. Require the secret on any non-local URL. |
| platform-9 | http-exception.filter.ts:45 | Non-HttpException 4xx (body-parser) are logged as 500 with a stack. Derive the status from the response. |
| platform-10 | error-handler.service.ts:11 | English-only PG, guard and special-case messages. Move them to MESSAGES. |
| platform-12 | bootstrap.ts:57; .env.example:31 | The Next rewrite does not append X-Forwarded-For, so counting it as a proxy hop lets clients spoof the IP and defeat per-IP throttles. Document that only XFF-appending proxies count. |
| billing-5 | billing.service.ts:225 | An empty STRIPE_PRICE_ID_PAID shadows the plan price (`??`). Use `||` and fail before creating the customer. |
| billing-6 | billing.service.ts:273 | A failed owner cancel clears an erasure-scheduled cancellation. Make it idempotent and restore the previous values. |
| billing-7 | stripe-payment.provider.ts:36 | unpaid, trialing and incomplete_expired map to INCOMPLETE while plan_id stays paid. Map them explicitly and downgrade. |
| billing-8, billing-x2 | billing-webhooks.service.ts:64 | The webhook ledger stores every event type forever, and stripe_customer_id survives erasure. Add a retention purge and null the id. |
| connections-reviews-5 | connections.service.ts:517 | disconnect is non-atomic. A failure after the DB step strands the refresh token, and the credential is deleted even if the revoke failed. Reorder, and have workers skip disconnected connections. |
| connections-reviews-6 | approve-reply.dto.ts:18 | Approve allows 5000 characters but Google allows 4096. Use MaxLength(4096). |
| connections-reviews-8 | connections.service.ts:319 | selectAccount does not re-verify the grant after claim(). Re-check userId and accountId. |
| connections-reviews-11 | review-sync-queue.service.ts:260 | Raw Google error text (500 characters, English) is stored and shown to tenants. Map it to MESSAGES tags. The post path is already sanitized (x-wt-2). |
| ai-prompts-misc-5, x-ai-auth-1 | notification-stream.service.ts:83 | SSE streams outlive a revocation for up to 15 minutes. Poll isRevoked per heartbeat. |
| ai-prompts-misc-6 | cloudinary-storage.provider.ts:106 | Oversized or unconfirmed avatar uploads are never deleted. Best-effort delete and sweep. |
| background-7, background-x1 | auth.repository.ts:1530 | A failed unlock still releases the client to the pool, which leaks the session lock. The wait is bounded by the 30 s statement_timeout. Use client.release(true). |
| background-8 | review-sync.queue.ts:25 | Poll jobs have no jobId and are retained 7 days. Use a deterministic jobId and shorten retention. |
| background-9 | sqs-queue-consumer.base.ts:96 | On SQS, onProcessingFailed runs on every receive, and the -dlq keeps unredacted bodies for 14 days. File only on the last receive. Use an opaque reference or SSE. |
| background-10 | logger.service.ts:35 | The log format never prints the trace. |
| background-13 | sqs-queue.publisher.ts:43 | The SQS publisher ignores jobId, so cron ticks are duplicated per replica on AWS. Use FIFO dedupe or a Redis tick lock. |
| background-14 | cron.processor.ts:96 (+email, review-post) | Async worker event handlers have no catch and there is no unhandledRejection handler. A DLQ error can kill the worker. |
| db-6, auth-8, db-x4 | auth.repository.ts:1060-1098 | The last-owner guard counts disabled or removal-pending owners and does not check the actor. JwtStrategy never re-reads status, and revokeUser is post-commit and fail-open. Count only active owners and re-read the actor under the lock. |
| db-7 | auth.repository.ts:51 | PURGEABLE_OTP_PURPOSES omits delete_account. |
| db-8 | review-sync.repository.ts:681 | The retention purge is one cross-tenant UPDATE under a 30 s timeout with no index. Batch it and add an index. |
| db-10 | reviews-read.repository.ts:93 | listReviews is not limited to active locations, so a different-account reconnect lists reviews twice. |
| web-tenant-3, x-wt-5 | login-view.tsx:48; accept-invite-view.tsx:87 | Members of an unconnected business are sent to the owner-only connect flow. The role is already in the token response, so the fix is web-only: route on user.role. |
| web-tenant-4 | use-onboarding-connect-flow.ts:484 | `in` on a plain object, so ?error=constructor crashes. Use Object.hasOwn. |
| web-tenant-5 | review.service.ts:188; dashboard.service.ts:62 | The hard-coded 'Anonymous' placeholder is shown in the German UI. |
| web-tenant-6 | manage-billing-dialog.tsx:45 | English-only page metadata, and Stripe Elements has no locale. |
| web-tenant-7 | use-settings.ts:154,180,253 | Stale-closure cache writes overwrite concurrent saves. Use functional setQueryData. |
| web-tenant-8 | use-oauth-error-toast.ts:54 | Clearing the SSO error also drops the `next` return path. |
| web-tenant-9 | use-onboarding-connect-flow.ts:269 | Backfill polling retries forever on non-404 errors. Add a bound and backoff, and stop on 401/403. |
| web-admin-3 | admin-billing-view.tsx:32 | A transient query error redirects the admin away from Billing. |
| web-admin-4 | post-erasure-charges-panel.tsx:62 | "Mark handled" has no confirmation. |
| web-admin-5 | admin settings profile-section.tsx:97,224 | The 72-byte cap is not enforced client-side. |
| web-admin-6 | auth.service.ts:273 | Logout navigates away in `finally` even if the call failed. |
| web-admin-7 | libs/client_sdk/package.json:22 | The SDK pins axios 1.12.2 and a localhost BASE_PATH. Fix the generator template and add a CI diff. |

---

## 4. Resolved by cross-talk

**Refuted**
- **admin-settings-x2:** a disabled, pending or removal-pending invitee cannot redeem an invite. Both accept paths update `WHERE status='invited'` and roll back otherwise. The side effect that toggled invitees can never accept became auth-9, merged into M5.
- **x-wt-1:** the payment-method and checkout-session IDOR does not exist. The customer id comes from the caller's tenant, Stripe rejects an unattached payment method, and reconcile requires `session.metadata.tenantId == caller`.
- **x-wt-3:** a cross-site GET to authorize cannot hijack a connect. The state is Redis-bound to an httpOnly sid cookie (SID_MISMATCH), and returnTo is allowlisted.
- **platform-x2:** a forged state cannot reach another tenant. Only the nonce is read from the blob, and it must exist in Redis and match the sid. This leaves only the low-severity secret-hardening part of platform-8.
- **background-1:** retracted by its author and verified by me. It is dropped.
- **connections-reviews x-connections-reviews-3 (the RESTRICT concern):** erasure anonymizes users in place and never hard-deletes them, so the RESTRICT is unreachable.

**Confirmed or upgraded**
- **Quota bypass:** confirmed by ai-prompts-misc, db and billing. The three findings were merged into M1. billing replied that the window is UTC and that `original_content` is a stable marker.
- **Platform activity log erasure gap:** confirmed by background (x4, db-x2). This produced M2 and, with the stripe_webhook_events retention gap, background-15 (low via billing-8). db confirmed that a placeholder rewrite fits the CHECK without a schema change.
- **Bull Board revocation bypass (platform-x1):** confirmed as the only such bypass.
- **x-ai-bg-1 and background-x4:** confirmed, which raised background-6 and added auth-10 (M31).
- **admin-settings-x3:** confirmed, and the tenant set-password and delete-account budgets also need userId keys (M30).
- **x-connections-reviews-5:** confirmed. The @Public connections callback bypasses the session-revocation marks. It re-checks neither demoted or disabled owners nor tenant status. Low, and not given its own row. Fix: reuse SessionRevocationService.isRevoked with the creation second, plus a DB re-read of role and tenant status.
- **web-tenant x-wt-4 (partly):** produced auth-7 (M6). GET mutations were not found in the auth module, and cookies are Lax.
- **x-wt-6 (partly):** the backend skips compression for SSE and sets no-transform. Next's rewrite proxyTimeout defaults to 30 s against a 25 s heartbeat, which is fragile. Raise experimental.proxyTimeout. The platform-12 TRUST_PROXY_HOPS finding came from this.

**Partly confirmed (severity adjusted)**
- **billing-x1:** a suspended or erased tenant is blocked by Redis marks in JwtStrategy, so no controller-level check is needed in the normal case. Those marks fail open on a Redis error, so a suspended owner's token stays valid up to 15 minutes. Low.
- **admin-settings-x1:** the Free limit is 1 and INVITED rows are counted, so the "unlimited invites" bypass is refuted. The invite count-then-insert race is real only if a limit above 1 is configured. Not given its own row.
- **background-x3:** the Stripe release is idempotent and retried. A late checkout cannot revive Paid, because of the event clock. Gaps remain at billing-4 and the best-effort cancellation (M18).
- **x-connections-reviews-4 (web-tenant):** the web impact is limited to second owners (no switcher or over-cap card, and a wrong onboarding stage). Members still see data through tenant-level queries. M4 stays medium.
- **auth-x3:** the throttler store is shared and atomic through Redis. It fails open when Redis errors, while the OTP counters fail closed. Express 5 defaults to the simple query parser, which corrects the auth-4 repro.
- **web-admin-x1:** confirmed that the admin cookie is Lax, httpOnly and has no Domain, with explicit-origin CORS. Residual risk is limited to same-site siblings.

**Disagreements between a reply and the original finding**
- **background-1 versus auth-x4's retraction:** the retraction is better evidenced. The wiring chain in the code supports it.
- **platform-3 versus platform-x3:** the original was medium. The reply showed the fail-open needs a non-production deploy that also sets DEV_VERIFY_EMAIL_TOKEN with a blank FRONTEND_URL, so it is downgraded to low.
- **auth-4:** the repro `state[]=` does not apply under Express 5's simple parser. A repeated key does reproduce it (confirmed against connections-reviews-7).

---

## 5. Coverage gaps

The agents' coverage notes were not included in the data I was given, so these gaps come from the findings and replies.
- **Other modules' GET handlers:** the state-changing-GET check was done only for the auth controllers. GET handlers elsewhere, other than the OAuth callbacks, were not audited.
- **Deployed topology:** ingress, CDN or nginx buffering for SSE, and the real count of XFF-appending hops, are not in the repo. The k3s folder holds monitoring stacks only.
- **Stripe dashboard settings:** the unpaid-subscription behaviour (billing-7), the event subscriptions (billing-8) and the retry settings could not be seen from the code.
- **Migration release status:** whether the first production release has happened is unknown. This decides whether M2 and M21 can be fixed by editing migrations in place or need new migration files.
- **Credential store:** whether old disconnected connections' secrets were deleted at revoke time was not visible (db-x2, partly).
- **Unverified internals:** background-2 depends on bullmq 5.58.6 stalled-job behaviour that I did not re-run. M9, M12, M13 and the AI-service findings were not individually spot-checked, because they are not high severity.
- **Not audited:** infra Terraform beyond sqs.tf, the Cloudinary and Google production configuration, and CI.