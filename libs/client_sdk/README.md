## @innopeak/client-sdk@1.0.0

This generator creates TypeScript/JavaScript client that utilizes [axios](https://github.com/axios/axios). The generated Node module can be used in the following environments:

Environment
* Node.js
* Webpack
* Browserify

Language level
* ES5 - you must have a Promises/A+ library installed
* ES6

Module system
* CommonJS
* ES6 module system

It can be used in both TypeScript and JavaScript. In TypeScript, the definition will be automatically resolved via `package.json`. ([Reference](https://www.typescriptlang.org/docs/handbook/declaration-files/consumption.html))

### Building

To build and compile the typescript sources to javascript use:
```
npm install
npm run build
```

### Publishing

First build the package then run `npm publish`

### Consuming

navigate to the folder of your consuming project and run one of the following commands.

_published:_

```
npm install @innopeak/client-sdk@1.0.0 --save
```

_unPublished (not recommended):_

```
npm install PATH_TO_GENERATED_PACKAGE --save
```

### Documentation for API Endpoints

All URIs are relative to *http://localhost*

Class | Method | HTTP request | Description
------------ | ------------- | ------------- | -------------
*AdminAuthApi* | [**platformAdminAuthControllerAcceptAdminInviteV1**](docs/AdminAuthApi.md#platformadminauthcontrolleracceptadmininvitev1) | **POST** /v1/admin/auth/invite/accept | Accept a platform-admin invite by setting a password
*AdminAuthApi* | [**platformAdminAuthControllerGoogleLoginV1**](docs/AdminAuthApi.md#platformadminauthcontrollergoogleloginv1) | **GET** /v1/admin/auth/google | Start a platform-admin Google sign-in
*AdminAuthApi* | [**platformAdminAuthControllerInviteGoogleAuthorizeV1**](docs/AdminAuthApi.md#platformadminauthcontrollerinvitegoogleauthorizev1) | **GET** /v1/admin/auth/invite/{token}/google | Accept a platform-admin invite via Google
*AdminAuthApi* | [**platformAdminAuthControllerLoginV1**](docs/AdminAuthApi.md#platformadminauthcontrollerloginv1) | **POST** /v1/admin/auth/login | Platform-admin password login
*AdminAuthApi* | [**platformAdminAuthControllerValidateAdminInviteV1**](docs/AdminAuthApi.md#platformadminauthcontrollervalidateadmininvitev1) | **GET** /v1/admin/auth/invite/{token} | Preview a platform-admin invite
*AdminBusinessesApi* | [**adminBusinessesControllerListV1**](docs/AdminBusinessesApi.md#adminbusinessescontrollerlistv1) | **GET** /v1/admin/businesses | List every tenant, as a Super Admin \&quot;business\&quot;
*AdminBusinessesApi* | [**adminBusinessesControllerUpdateStatusV1**](docs/AdminBusinessesApi.md#adminbusinessescontrollerupdatestatusv1) | **POST** /v1/admin/businesses/{tenantId}/status | Suspend or reactivate a tenant
*AdminOverviewApi* | [**adminOverviewControllerGetNeedsAttentionV1**](docs/AdminOverviewApi.md#adminoverviewcontrollergetneedsattentionv1) | **GET** /v1/admin/overview/needs-attention | Businesses needing attention
*AdminOverviewApi* | [**adminOverviewControllerGetRecentActivityV1**](docs/AdminOverviewApi.md#adminoverviewcontrollergetrecentactivityv1) | **GET** /v1/admin/overview/activity | Most recent platform-admin actions
*AdminOverviewApi* | [**adminOverviewControllerGetRecentBusinessesV1**](docs/AdminOverviewApi.md#adminoverviewcontrollergetrecentbusinessesv1) | **GET** /v1/admin/overview/recent-businesses | Most recently created businesses
*AdminOverviewApi* | [**adminOverviewControllerGetSignupTrendV1**](docs/AdminOverviewApi.md#adminoverviewcontrollergetsignuptrendv1) | **GET** /v1/admin/overview/signup-trend | Tenant signups by month
*AdminOverviewApi* | [**adminOverviewControllerGetStatsV1**](docs/AdminOverviewApi.md#adminoverviewcontrollergetstatsv1) | **GET** /v1/admin/overview/stats | Overview stat cards
*AdminSettingsApi* | [**adminAvatarControllerAuthorizeV1**](docs/AdminSettingsApi.md#adminavatarcontrollerauthorizev1) | **POST** /v1/admin/settings/profile/avatar/authorize | Get a signed avatar upload authorization
*AdminSettingsApi* | [**adminAvatarControllerConfirmAvatarV1**](docs/AdminSettingsApi.md#adminavatarcontrollerconfirmavatarv1) | **POST** /v1/admin/settings/profile/avatar/confirm | Confirm an uploaded avatar
*AdminSettingsApi* | [**adminSettingsControllerChangePasswordV1**](docs/AdminSettingsApi.md#adminsettingscontrollerchangepasswordv1) | **POST** /v1/admin/settings/profile/change-password | Change the signed-in platform admin\&#39;s own password
*AdminSettingsApi* | [**adminSettingsControllerGetProfileV1**](docs/AdminSettingsApi.md#adminsettingscontrollergetprofilev1) | **GET** /v1/admin/settings/profile | Get the signed-in platform admin\&#39;s own profile
*AdminSettingsApi* | [**adminSettingsControllerListInvitesV1**](docs/AdminSettingsApi.md#adminsettingscontrollerlistinvitesv1) | **GET** /v1/admin/settings/invites | List every platform admin, including the seeded root
*AdminSettingsApi* | [**adminSettingsControllerRequestSetPasswordOtpV1**](docs/AdminSettingsApi.md#adminsettingscontrollerrequestsetpasswordotpv1) | **POST** /v1/admin/settings/profile/set-password/request-otp | Request the OTP required to add a first password
*AdminSettingsApi* | [**adminSettingsControllerRevokeInviteV1**](docs/AdminSettingsApi.md#adminsettingscontrollerrevokeinvitev1) | **DELETE** /v1/admin/settings/invites/{inviteId} | Revoke a pending invite
*AdminSettingsApi* | [**adminSettingsControllerSendInviteV1**](docs/AdminSettingsApi.md#adminsettingscontrollersendinvitev1) | **POST** /v1/admin/settings/invites | Invite a new platform admin
*AdminSettingsApi* | [**adminSettingsControllerSetAdminStatusV1**](docs/AdminSettingsApi.md#adminsettingscontrollersetadminstatusv1) | **PATCH** /v1/admin/settings/admins/{adminId}/status | Disable or re-enable a platform admin
*AdminSettingsApi* | [**adminSettingsControllerSetPasswordV1**](docs/AdminSettingsApi.md#adminsettingscontrollersetpasswordv1) | **POST** /v1/admin/settings/profile/set-password | Set the signed-in platform admin\&#39;s first password
*AdminSettingsApi* | [**adminSettingsControllerUpdateLocaleV1**](docs/AdminSettingsApi.md#adminsettingscontrollerupdatelocalev1) | **PATCH** /v1/admin/settings/profile/locale | Set the language responses are rendered in
*AdminSettingsApi* | [**adminSettingsControllerUpdatePlatformSettingsV1**](docs/AdminSettingsApi.md#adminsettingscontrollerupdateplatformsettingsv1) | **PATCH** /v1/admin/settings/platform-config | Update platform-wide feature settings
*AdminUsersApi* | [**adminUsersControllerListV1**](docs/AdminUsersApi.md#adminuserscontrollerlistv1) | **GET** /v1/admin/users | List every user across every tenant
*AdminUsersApi* | [**adminUsersControllerToggleActiveV1**](docs/AdminUsersApi.md#adminuserscontrollertoggleactivev1) | **POST** /v1/admin/users/{userId}/toggle-active | Toggle a user\&#39;s active status
*AuthApi* | [**authControllerAcceptMemberInviteV1**](docs/AuthApi.md#authcontrolleracceptmemberinvitev1) | **POST** /v1/auth/invite/accept | Accept a tenant-member invite by setting a name and password
*AuthApi* | [**authControllerChangePasswordV1**](docs/AuthApi.md#authcontrollerchangepasswordv1) | **POST** /v1/auth/change-password | Change the current user’s password
*AuthApi* | [**authControllerCompleteGoogleSignupV1**](docs/AuthApi.md#authcontrollercompletegooglesignupv1) | **POST** /v1/auth/google/complete-signup | Finish a Google signup with a business name
*AuthApi* | [**authControllerGoogleAuthorizeV1**](docs/AuthApi.md#authcontrollergoogleauthorizev1) | **GET** /v1/auth/google | Start Google sign-in or signup
*AuthApi* | [**authControllerGoogleCallbackV1**](docs/AuthApi.md#authcontrollergooglecallbackv1) | **GET** /v1/auth/google/callback | Google sign-in callback
*AuthApi* | [**authControllerInviteGoogleAuthorizeV1**](docs/AuthApi.md#authcontrollerinvitegoogleauthorizev1) | **GET** /v1/auth/invite/{token}/google | Accept a tenant-member invite via Google
*AuthApi* | [**authControllerLoginV1**](docs/AuthApi.md#authcontrollerloginv1) | **POST** /v1/auth/login | Password login
*AuthApi* | [**authControllerLogoutV1**](docs/AuthApi.md#authcontrollerlogoutv1) | **POST** /v1/auth/logout | Revoke every refresh token for the current user
*AuthApi* | [**authControllerMeV1**](docs/AuthApi.md#authcontrollermev1) | **GET** /v1/auth/me | The signed-in tenant user
*AuthApi* | [**authControllerRefreshV1**](docs/AuthApi.md#authcontrollerrefreshv1) | **POST** /v1/auth/refresh | Rotate the refresh token, mint a fresh access token
*AuthApi* | [**authControllerRequestSetPasswordOtpV1**](docs/AuthApi.md#authcontrollerrequestsetpasswordotpv1) | **POST** /v1/auth/set-password/request-otp | Request the OTP required to set a password on a passwordless account
*AuthApi* | [**authControllerResendOtpV1**](docs/AuthApi.md#authcontrollerresendotpv1) | **POST** /v1/auth/resend-verification-otp | Resend a verification OTP
*AuthApi* | [**authControllerSetPasswordV1**](docs/AuthApi.md#authcontrollersetpasswordv1) | **POST** /v1/auth/set-password | Set a password for an account that has never had one
*AuthApi* | [**authControllerSignupV1**](docs/AuthApi.md#authcontrollersignupv1) | **POST** /v1/auth/signup | Owner self-registration (password path)
*AuthApi* | [**authControllerUpdateLocaleV1**](docs/AuthApi.md#authcontrollerupdatelocalev1) | **POST** /v1/auth/locale | Set the language responses are rendered in
*AuthApi* | [**authControllerValidateMemberInviteV1**](docs/AuthApi.md#authcontrollervalidatememberinvitev1) | **GET** /v1/auth/invite/{token} | Preview a tenant-member invite
*AuthApi* | [**authControllerVerifyEmailV1**](docs/AuthApi.md#authcontrollerverifyemailv1) | **POST** /v1/auth/verify-email | Consume a signup/login verification OTP (password path only)
*AuthApi* | [**tenantAvatarControllerAuthorizeV1**](docs/AuthApi.md#tenantavatarcontrollerauthorizev1) | **POST** /v1/auth/avatar/authorize | Get a signed avatar upload authorization
*AuthApi* | [**tenantAvatarControllerConfirmAvatarV1**](docs/AuthApi.md#tenantavatarcontrollerconfirmavatarv1) | **POST** /v1/auth/avatar/confirm | Confirm an uploaded avatar
*ConnectionsApi* | [**connectionsControllerAuthorizeV1**](docs/ConnectionsApi.md#connectionscontrollerauthorizev1) | **GET** /v1/connections/google/authorize | Start the Google Business Profile grant (302 to consent)
*ConnectionsApi* | [**connectionsControllerAvailableLocationsV1**](docs/ConnectionsApi.md#connectionscontrolleravailablelocationsv1) | **GET** /v1/connections/google/available-locations | Locations the granted Google account can see (live provider call)
*ConnectionsApi* | [**connectionsControllerCallbackV1**](docs/ConnectionsApi.md#connectionscontrollercallbackv1) | **GET** /v1/connections/google/callback | Google OAuth callback (public — Google performs this request)
*ConnectionsApi* | [**connectionsControllerConfirmLocationV1**](docs/ConnectionsApi.md#connectionscontrollerconfirmlocationv1) | **POST** /v1/connections/locations | Confirm the managed locations and start each historical backfill
*ConnectionsApi* | [**connectionsControllerDisconnectV1**](docs/ConnectionsApi.md#connectionscontrollerdisconnectv1) | **DELETE** /v1/connections/google | Disconnect Google Business Profile
*ConnectionsApi* | [**connectionsControllerGetConnectionV1**](docs/ConnectionsApi.md#connectionscontrollergetconnectionv1) | **GET** /v1/connections | The tenant\&#39;s whole connection picture in one call
*ConnectionsApi* | [**connectionsControllerListLocationsV1**](docs/ConnectionsApi.md#connectionscontrollerlistlocationsv1) | **GET** /v1/connections/locations | The tenant\&#39;s persisted locations
*ConnectionsApi* | [**connectionsControllerSetActiveLocationV1**](docs/ConnectionsApi.md#connectionscontrollersetactivelocationv1) | **PATCH** /v1/connections/active-location | Switch the tenant\&#39;s currently-viewed business
*ConnectionsSyncApi* | [**connectionsSyncControllerGetBackfillV1**](docs/ConnectionsSyncApi.md#connectionssynccontrollergetbackfillv1) | **GET** /v1/connections/locations/{locationId}/backfill | Progress of the one-time historical import
*ConnectionsSyncApi* | [**connectionsSyncControllerGetSyncHealthV1**](docs/ConnectionsSyncApi.md#connectionssynccontrollergetsynchealthv1) | **GET** /v1/connections/locations/{locationId}/sync-health | Is ingestion working for this location
*ConnectionsSyncApi* | [**connectionsSyncControllerListSyncRunsV1**](docs/ConnectionsSyncApi.md#connectionssynccontrollerlistsyncrunsv1) | **GET** /v1/connections/locations/{locationId}/sync-runs | Paginated sync-run history, newest first
*DashboardApi* | [**dashboardControllerGetMetricsV1**](docs/DashboardApi.md#dashboardcontrollergetmetricsv1) | **GET** /v1/dashboard/metrics | Aggregated metrics for the dashboard stat cards
*DashboardApi* | [**dashboardControllerGetRecentEscalatedV1**](docs/DashboardApi.md#dashboardcontrollergetrecentescalatedv1) | **GET** /v1/dashboard/recent-escalated | Most recent escalated reviews still awaiting action
*NotificationsApi* | [**notificationsControllerListV1**](docs/NotificationsApi.md#notificationscontrollerlistv1) | **GET** /v1/notifications | List the caller’s notifications
*NotificationsApi* | [**notificationsControllerMarkAllReadV1**](docs/NotificationsApi.md#notificationscontrollermarkallreadv1) | **PATCH** /v1/notifications/read-all | Mark the caller’s whole feed read
*NotificationsApi* | [**notificationsControllerMarkReadV1**](docs/NotificationsApi.md#notificationscontrollermarkreadv1) | **PATCH** /v1/notifications/{notificationId}/read | Mark one notification read
*PromptsApi* | [**promptsControllerCreateVersionV1**](docs/PromptsApi.md#promptscontrollercreateversionv1) | **POST** /v1/prompts/{promptId}/versions | Append a prompt version
*PromptsApi* | [**promptsControllerGetVersionStatsBatchV1**](docs/PromptsApi.md#promptscontrollergetversionstatsbatchv1) | **POST** /v1/prompts/stats/batch | Get prompt analytics for many (promptId, version) pairs
*PromptsApi* | [**promptsControllerGetVersionStatsV1**](docs/PromptsApi.md#promptscontrollergetversionstatsv1) | **GET** /v1/prompts/{promptId}/stats | Get prompt analytics
*PromptsApi* | [**promptsControllerListV1**](docs/PromptsApi.md#promptscontrollerlistv1) | **GET** /v1/prompts | List tenant prompts
*PromptsApi* | [**promptsControllerUpdateToneV1**](docs/PromptsApi.md#promptscontrollerupdatetonev1) | **PUT** /v1/prompts/{promptId}/tone | Update prompt tone
*ReviewsApi* | [**reviewsControllerGetReviewV1**](docs/ReviewsApi.md#reviewscontrollergetreviewv1) | **GET** /v1/reviews/{reviewId} | One review with every response attached
*ReviewsApi* | [**reviewsControllerListReviewsV1**](docs/ReviewsApi.md#reviewscontrollerlistreviewsv1) | **GET** /v1/reviews | The review queue listing
*SettingsApi* | [**blocklistTermsControllerCreateV1**](docs/SettingsApi.md#blocklisttermscontrollercreatev1) | **POST** /v1/settings/blocklist-terms | Add a blocklist term
*SettingsApi* | [**blocklistTermsControllerListV1**](docs/SettingsApi.md#blocklisttermscontrollerlistv1) | **GET** /v1/settings/blocklist-terms | List blocklist terms
*SettingsApi* | [**blocklistTermsControllerRemoveV1**](docs/SettingsApi.md#blocklisttermscontrollerremovev1) | **DELETE** /v1/settings/blocklist-terms/{id} | Remove a blocklist term
*SettingsApi* | [**notificationRecipientsControllerListV1**](docs/SettingsApi.md#notificationrecipientscontrollerlistv1) | **GET** /v1/settings/notification-recipients | List escalation notification recipients
*SettingsApi* | [**notificationRecipientsControllerUpdateV1**](docs/SettingsApi.md#notificationrecipientscontrollerupdatev1) | **PATCH** /v1/settings/notification-recipients/{recipientId} | Update a notification recipient
*SettingsApi* | [**platformSettingsControllerGetV1**](docs/SettingsApi.md#platformsettingscontrollergetv1) | **GET** /v1/settings/platform-config | Get platform-wide feature settings
*SettingsApi* | [**tenantMembersControllerInviteV1**](docs/SettingsApi.md#tenantmemberscontrollerinvitev1) | **POST** /v1/settings/members | Invite a teammate
*SettingsApi* | [**tenantMembersControllerListV1**](docs/SettingsApi.md#tenantmemberscontrollerlistv1) | **GET** /v1/settings/members | List this tenant\&#39;s team, owner included
*SettingsApi* | [**tenantMembersControllerRevokeV1**](docs/SettingsApi.md#tenantmemberscontrollerrevokev1) | **DELETE** /v1/settings/members/{memberId} | Revoke a pending invite
*SettingsApi* | [**tenantSettingsControllerGetV1**](docs/SettingsApi.md#tenantsettingscontrollergetv1) | **GET** /v1/settings | Get tenant settings
*SettingsApi* | [**tenantSettingsControllerReplaceV1**](docs/SettingsApi.md#tenantsettingscontrollerreplacev1) | **PUT** /v1/settings | Replace tenant settings


### Documentation For Models

 - [AcceptAdminInviteDto](docs/AcceptAdminInviteDto.md)
 - [AcceptMemberInviteDto](docs/AcceptMemberInviteDto.md)
 - [AdminBusinessResponseDto](docs/AdminBusinessResponseDto.md)
 - [AdminInvitePreviewDto](docs/AdminInvitePreviewDto.md)
 - [AdminInviteResponseDto](docs/AdminInviteResponseDto.md)
 - [AdminOverviewStatsResponseDto](docs/AdminOverviewStatsResponseDto.md)
 - [AdminProfileResponseDto](docs/AdminProfileResponseDto.md)
 - [AdminSignupTrendPointResponseDto](docs/AdminSignupTrendPointResponseDto.md)
 - [AdminUserResponseDto](docs/AdminUserResponseDto.md)
 - [AuthenticatedUserDto](docs/AuthenticatedUserDto.md)
 - [AvailableLocationDto](docs/AvailableLocationDto.md)
 - [AvailableLocationsResponseDto](docs/AvailableLocationsResponseDto.md)
 - [AvatarUploadAuthorizationResponseDto](docs/AvatarUploadAuthorizationResponseDto.md)
 - [BackfillProgressResponseDto](docs/BackfillProgressResponseDto.md)
 - [BackfillSummaryDto](docs/BackfillSummaryDto.md)
 - [BlocklistTermDto](docs/BlocklistTermDto.md)
 - [BlocklistTermListResponseDto](docs/BlocklistTermListResponseDto.md)
 - [ChangeAdminPasswordDto](docs/ChangeAdminPasswordDto.md)
 - [ChangePasswordDto](docs/ChangePasswordDto.md)
 - [CompleteGoogleSignupDto](docs/CompleteGoogleSignupDto.md)
 - [ConfirmAvatarDto](docs/ConfirmAvatarDto.md)
 - [ConfirmAvatarResponseDto](docs/ConfirmAvatarResponseDto.md)
 - [ConfirmLocationDto](docs/ConfirmLocationDto.md)
 - [ConfirmLocationResponseDto](docs/ConfirmLocationResponseDto.md)
 - [ConfirmLocationsResponseDto](docs/ConfirmLocationsResponseDto.md)
 - [ConnectionLocationDto](docs/ConnectionLocationDto.md)
 - [ConnectionStatusResponseDto](docs/ConnectionStatusResponseDto.md)
 - [ConnectionSummaryDto](docs/ConnectionSummaryDto.md)
 - [CreateBlocklistTermDto](docs/CreateBlocklistTermDto.md)
 - [CreatePromptVersionDto](docs/CreatePromptVersionDto.md)
 - [CreatePromptVersionResponseDto](docs/CreatePromptVersionResponseDto.md)
 - [CurrentRunDto](docs/CurrentRunDto.md)
 - [DeleteBlocklistTermResponseDto](docs/DeleteBlocklistTermResponseDto.md)
 - [DisconnectResponseDto](docs/DisconnectResponseDto.md)
 - [GetPromptStatsBatchDto](docs/GetPromptStatsBatchDto.md)
 - [InviteMemberDto](docs/InviteMemberDto.md)
 - [LatestResponseDto](docs/LatestResponseDto.md)
 - [LocationDto](docs/LocationDto.md)
 - [LocationListResponseDto](docs/LocationListResponseDto.md)
 - [LoginDto](docs/LoginDto.md)
 - [MemberInvitePreviewDto](docs/MemberInvitePreviewDto.md)
 - [MetricsDto](docs/MetricsDto.md)
 - [NotificationDto](docs/NotificationDto.md)
 - [NotificationListResponseDto](docs/NotificationListResponseDto.md)
 - [NotificationReadResponseDto](docs/NotificationReadResponseDto.md)
 - [NotificationRecipientDto](docs/NotificationRecipientDto.md)
 - [NotificationRecipientListResponseDto](docs/NotificationRecipientListResponseDto.md)
 - [PaginationMetaDto](docs/PaginationMetaDto.md)
 - [PlatformActivityResponseDto](docs/PlatformActivityResponseDto.md)
 - [PlatformSettingsResponseDto](docs/PlatformSettingsResponseDto.md)
 - [PromptCreatedByDto](docs/PromptCreatedByDto.md)
 - [PromptCurrentVersionDto](docs/PromptCurrentVersionDto.md)
 - [PromptDto](docs/PromptDto.md)
 - [PromptListResponseDto](docs/PromptListResponseDto.md)
 - [PromptStatsBatchItemDto](docs/PromptStatsBatchItemDto.md)
 - [PromptStatsBatchPairDto](docs/PromptStatsBatchPairDto.md)
 - [PromptStatsBatchResponseDto](docs/PromptStatsBatchResponseDto.md)
 - [PromptVersionDto](docs/PromptVersionDto.md)
 - [PromptVersionStatsResponseDto](docs/PromptVersionStatsResponseDto.md)
 - [RecentEscalatedDto](docs/RecentEscalatedDto.md)
 - [ResendOtpDto](docs/ResendOtpDto.md)
 - [ReviewDetailResponseDto](docs/ReviewDetailResponseDto.md)
 - [ReviewListItemDto](docs/ReviewListItemDto.md)
 - [ReviewListResponseDto](docs/ReviewListResponseDto.md)
 - [ReviewResponseItemDto](docs/ReviewResponseItemDto.md)
 - [ReviewsMetaDto](docs/ReviewsMetaDto.md)
 - [SendAdminInviteDto](docs/SendAdminInviteDto.md)
 - [SetActiveLocationDto](docs/SetActiveLocationDto.md)
 - [SetAdminPasswordDto](docs/SetAdminPasswordDto.md)
 - [SetAdminStatusDto](docs/SetAdminStatusDto.md)
 - [SetPasswordDto](docs/SetPasswordDto.md)
 - [SignupDto](docs/SignupDto.md)
 - [SignupResponseDto](docs/SignupResponseDto.md)
 - [SyncHealthResponseDto](docs/SyncHealthResponseDto.md)
 - [SyncRunDto](docs/SyncRunDto.md)
 - [SyncRunListResponseDto](docs/SyncRunListResponseDto.md)
 - [TenantMemberResponseDto](docs/TenantMemberResponseDto.md)
 - [TenantMembersControllerRevokeV1200Response](docs/TenantMembersControllerRevokeV1200Response.md)
 - [TenantSettingsResponseDto](docs/TenantSettingsResponseDto.md)
 - [TokenResponseDto](docs/TokenResponseDto.md)
 - [UpdateAdminLocaleResponseDto](docs/UpdateAdminLocaleResponseDto.md)
 - [UpdateBusinessStatusDto](docs/UpdateBusinessStatusDto.md)
 - [UpdateLocaleDto](docs/UpdateLocaleDto.md)
 - [UpdateLocaleResponseDto](docs/UpdateLocaleResponseDto.md)
 - [UpdateNotificationRecipientDto](docs/UpdateNotificationRecipientDto.md)
 - [UpdatePlatformSettingsDto](docs/UpdatePlatformSettingsDto.md)
 - [UpdatePromptToneDto](docs/UpdatePromptToneDto.md)
 - [UpdatePromptToneResponseDto](docs/UpdatePromptToneResponseDto.md)
 - [UpdateTenantSettingsDto](docs/UpdateTenantSettingsDto.md)
 - [VerifyEmailDto](docs/VerifyEmailDto.md)


<a id="documentation-for-authorization"></a>
## Documentation For Authorization


Authentication schemes defined for the API:
<a id="bearer"></a>
### bearer

- **Type**: Bearer authentication (JWT)

