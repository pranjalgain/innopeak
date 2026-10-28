---
sidebar_position: 8
---

# Business Settings

These are the settings a business controls for itself. Most are changed by the **owner** in the
Settings screen of the business console (`/settings`, a tab per area). Team **members** see only
their own Profile tab. Who can do what is summarised in [Roles and permissions](./roles-and-permissions.md).
Settings that apply to the whole installation are in [Platform settings](./platform-settings.md).

## Reply and review behaviour

| Setting | Values and default | What it does | Where |
|---|---|---|---|
| Escalation threshold | 1 to 5, default 3 | A review with a rating **strictly below** this value is escalated to a person instead of getting an AI reply. With the default of 3, one- and two-star reviews escalate. Not retroactive. A blocklist match escalates before the rating is checked | Settings, General |
| AI reply count | 1 to 3, default 2 | How many draft replies the AI writes for each review, labelled A, B and C | Settings, AI |
| Auto-post | on or off, default off | When on, an ordinary (non-escalated) review gets one draft that is approved and posted to Google without a person, unless the draft trips the safety check (a link, a phone number other than the business's own, an email address, placeholder text, or over Google's length). Escalated reviews always wait for a person. **There is no control for it in the console yet**: it can only be changed through the API (`PUT /v1/settings`) | none |
| Reviewer data retention | whole months, or unset (default unset) | After this many months the reviewer's name and external id are removed from a review by the nightly purge. The rating, text and classification stay. Unset means reviewer data is kept | Settings, General |
| Blocklist | up to 255 characters per term | A review containing any term is escalated. Terms are unique per business, ignoring case | Settings, Blocklist |
| Prompts | positive, neutral and escalated, each with a tone | The instructions the AI follows when writing replies. Every change creates a new version, with usage statistics per version. **Editing is only available on the Paid plan** | `/settings/prompts` |

## People and notifications

| Setting | What it does | Where |
|---|---|---|
| Members | Invite colleagues by email, revoke an invitation, and remove a member (a removal request has a grace period, like a business deletion, and can be cancelled). The Free plan allows one team member. The tab is hidden when an administrator turns member invitations off | Settings, Members |
| Notification recipients | Who receives email or Microsoft Teams notifications, with a channel of `email`, `teams` or `both` and an on or off switch per recipient. Available only when an administrator switches notification settings on, which is not possible yet | Settings, Notifications |
| Bell notifications | Review escalated, reply needs approval, reply approved and connection issue, shown to every active user of the business. They are not configurable. Read ones are deleted after 90 days, unread after 180 | Bell in the header |

## Connection and locations

| Setting | What it does | Where |
|---|---|---|
| Google connection | Connect or disconnect the business's Google Business Profile. Choosing the Google account, then the locations (up to 50 active) to manage. A disconnected business stops syncing | Settings, Connection, and onboarding |
| Active location | The location the console is showing. Switch it from the business switcher in the header | Header |

## Billing

| Setting | What it does | Where |
|---|---|---|
| Plan | Free or Paid, changed through Stripe checkout and the Stripe customer portal | Settings, Billing, and onboarding |
| Payment method, billing profile and receipts | Card on file, company details for invoices, and downloadable receipts | Settings, Billing |

The Billing tab appears when payments are switched on, or when the business is already on the Paid
plan. Only owners can reach it.

### Plan limits

Seeded in `0011_billing.sql` and enforced by `billing-entitlements.service.ts`.

| Limit | Free | Paid |
|---|---|---|
| Locations | 1 | unlimited |
| AI drafts per month | 20 | unlimited |
| Team members | 1 | unlimited |
| Custom prompts | no | yes |

A Free business that has more locations than the plan allows keeps one active, and the rest are
**paused**: they are not polled and their reviews are hidden until the owner upgrades. The owners are
emailed when locations are paused. **All limits are lifted while `PAYMENT_FEATURE_ENABLED` is off.**

## Profile and account

| Setting | Who | What it does | Where |
|---|---|---|---|
| Profile picture | Owner, member | Uploaded straight to Cloudinary and confirmed by the server. Needs Cloudinary configured | Settings, Profile |
| Password | Owner, member | Change it, or, for an account that only ever signed in with Google or Microsoft, add one after confirming a code emailed to the account | Settings, Profile |
| Language | Owner, member | English or German, from the language switcher in the header. Emails follow it too | Header |
| Export data | Owner | Downloads the business's data. Limited to 3 requests a minute | Settings, General |
| Delete business | Owner | Starts a deletion that can be undone during the grace period (21 days by default, `ERASURE_GRACE_PERIOD_DAYS`). The owners are emailed, and the nightly purge erases the business when the period ends | Settings, General |

Administrators have their own profile, password and language on `/admin/settings`.

## Where this is stored

| Data | Table |
|---|---|
| Threshold, auto-post, retention, AI reply count | `tenant_settings` |
| Blocklist | `blocklist_terms` |
| Notification recipients | `notification_recipients` |
| Prompts and versions | `prompts`, `prompt_versions` |
| Plan and subscription, receipts | `tenant_subscriptions`, `billing_receipts`, `billing_plans` |
| Google connection and locations | `review_provider_connections`, `locations` |
| Profile pictures | `media` |
