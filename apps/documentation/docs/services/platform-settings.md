---
sidebar_position: 7
---

# Platform Settings

Platform settings are the switches a platform administrator controls for the **whole installation**,
as opposed to a single business. They decide which sign-in methods the public screens offer and
whether business owners can invite colleagues. There is one set of them, stored in a single database
row (`platform_settings`, migration `0008_platform_settings.sql`).

Alongside the switches sit a few **deploy-level values** that are shown to the web app but can only
be changed by whoever deploys the system, because they come from environment variables.

## Where administrators change them

Platform admins open **Admin, then Settings** (`/admin/settings`, `platform-section.tsx`). The screen
calls `PATCH /v1/admin/settings/platform-config`. Any active platform admin can change these
settings. Every change is written to the platform activity log, with the values that moved.

Anyone, signed in or not, can read the current values from `GET /v1/settings/platform-config`. The
sign-in and sign-up screens use it to decide which buttons to show.

## The switches

| Setting | Default | What it controls |
|---|---|---|
| `passwordLoginEnabled` | on | Email and password for businesses: sign-up, sign-in, the emailed sign-up code, and accepting an invitation with a password. When off, the login screen hides the form and the server refuses all of these. Turn it off where no email service is set up, because sign-up codes cannot be delivered. Sessions that already exist, and platform admins, are not affected |
| `googleLoginEnabled` | on | Google sign-in, sign-up and invitation acceptance for businesses |
| `microsoftLoginEnabled` | on | Microsoft sign-in, sign-up and invitation acceptance for businesses |
| `inviteMembersEnabled` | on | Whether owners see the Members tab in Settings and can invite colleagues. When off, invitations are refused by the API as well |
| `notificationSettingsEnabled` | off | Whether owners see the Notifications tab, where they choose email and Teams recipients. See the note below |

All three sign-in switches are enforced on the server, not only by hiding the button or the form, so a
bookmarked link or a direct request cannot sign anyone in once a method is off.

**Switching the password off locks out businesses whose only way in is a password.** Turning Google or
Microsoft off asks the admin to confirm when it would strand people who only sign in that way; the
password switch does not ask. Turn it back on to restore their access.

**Platform admins are not affected by the business sign-in switches.** The admin sign-in page keeps its
own Google and Microsoft buttons, because an administrator who accepted an invitation through Google
has no other way back in. Those buttons follow the deploy-level availability values below.

### Rules the system enforces

- **At least one method must stay on.** The database refuses a row with Microsoft, password and Google
  all off (`platform_settings_at_least_one_method_check`), and the API checks it first.
- **A method only counts if it can be used.** Turning a method off is refused if it would leave only
  methods that are not usable: Microsoft and Google also need their credentials configured on this
  server (see [External services](./external-services.md)), while the password switch always works.
  Otherwise nobody could sign in or sign up and nothing would explain why.
- **Email/password can only be switched back on when email can be delivered.** Changing it from off to
  on is refused with a 422 `PASSWORD_LOGIN_NEEDS_EMAIL_SERVICE` and a message in the admin's language,
  unless the server has a working email service: it runs in production, `EMAIL_FROM` is set, and for
  SMTP `SMTP_HOST` is set too (see [External services](./external-services.md#email)). A sign-up is
  completed by an emailed code and invitations are emailed, so turning it on without email would offer
  a sign-in that cannot finish. A developer's machine is exempt, switching it off is never refused, and
  neither is sending `on` when it is already on.
- **`notificationSettingsEnabled` cannot be switched on yet.** Only the in-app bell exists. Email and
  Teams delivery are not built, so the API refuses `true` (a `TODO(notifications)` in
  `admin-settings.service.ts` marks the check to remove once they exist). Sending `false` is always
  accepted.

## Deploy-level values

These are part of the same response, but read-only. Change them in the environment, then restart.
They are listed in [Configuration reference](./configuration-reference.md).

| Value | Comes from | Meaning |
|---|---|---|
| `paymentFeatureEnabled` | `PAYMENT_FEATURE_ENABLED` | Whether checkout is offered. When off, every plan limit is lifted as well |
| `erasureGracePeriodDays` | `ERASURE_GRACE_PERIOD_DAYS` | Days a deletion request can be undone, shown to owners in the delete-business flow |
| `adminMicrosoftLoginAvailable` | `ADMIN_MICROSOFT_TENANT_ID` and the Microsoft client | Whether the admin sign-in page shows Microsoft |
| `adminGoogleLoginAvailable` | The Google client credentials | Whether the admin sign-in page shows Google |

The two `admin...Available` values mean the deployment *could* sign an admin in with that provider. A
deployment that cannot never shows a button that could only fail.

## Related

- [Settings module](../backend/settings/overview.md) and its [API reference](../backend/settings/api-reference.md)
- [Business settings](./business-settings.md) for what each business controls for itself
