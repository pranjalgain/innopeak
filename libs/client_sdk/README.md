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
*AdminBusinessesApi* | [**adminBusinessesControllerListV1**](docs/AdminBusinessesApi.md#adminbusinessescontrollerlistv1) | **GET** /v1/admin/businesses | List every tenant, as a Super Admin \&quot;business\&quot;
*AdminBusinessesApi* | [**adminBusinessesControllerUpdateStatusV1**](docs/AdminBusinessesApi.md#adminbusinessescontrollerupdatestatusv1) | **POST** /v1/admin/businesses/{tenantId}/status | Suspend or reactivate a tenant
*AdminOverviewApi* | [**adminOverviewControllerGetRecentActivityV1**](docs/AdminOverviewApi.md#adminoverviewcontrollergetrecentactivityv1) | **GET** /v1/admin/overview/activity | Most recent platform-admin actions
*AdminOverviewApi* | [**adminOverviewControllerGetReviewStatsV1**](docs/AdminOverviewApi.md#adminoverviewcontrollergetreviewstatsv1) | **GET** /v1/admin/overview/review-stats | Platform-wide review throughput
*AdminSettingsApi* | [**adminSettingsControllerChangePasswordV1**](docs/AdminSettingsApi.md#adminsettingscontrollerchangepasswordv1) | **POST** /v1/admin/settings/profile/change-password | Change the signed-in platform admin\&#39;s own password
*AdminSettingsApi* | [**adminSettingsControllerGetProfileV1**](docs/AdminSettingsApi.md#adminsettingscontrollergetprofilev1) | **GET** /v1/admin/settings/profile | Get the signed-in platform admin\&#39;s own profile
*AdminSettingsApi* | [**adminSettingsControllerListInvitesV1**](docs/AdminSettingsApi.md#adminsettingscontrollerlistinvitesv1) | **GET** /v1/admin/settings/invites | List every platform admin, including the seeded root
*AdminSettingsApi* | [**adminSettingsControllerRevokeInviteV1**](docs/AdminSettingsApi.md#adminsettingscontrollerrevokeinvitev1) | **DELETE** /v1/admin/settings/invites/{inviteId} | Revoke a pending invite
*AdminSettingsApi* | [**adminSettingsControllerSendInviteV1**](docs/AdminSettingsApi.md#adminsettingscontrollersendinvitev1) | **POST** /v1/admin/settings/invites | Invite a new platform admin
*AdminSettingsApi* | [**adminSettingsControllerSetAdminStatusV1**](docs/AdminSettingsApi.md#adminsettingscontrollersetadminstatusv1) | **PATCH** /v1/admin/settings/admins/{adminId}/status | Disable or re-enable a platform admin
*AdminSettingsApi* | [**adminSettingsControllerUpdateAvatarV1**](docs/AdminSettingsApi.md#adminsettingscontrollerupdateavatarv1) | **PUT** /v1/admin/settings/profile/avatar | Set the avatar URL
*AdminSettingsApi* | [**adminSettingsControllerUpdatePlatformSettingsV1**](docs/AdminSettingsApi.md#adminsettingscontrollerupdateplatformsettingsv1) | **PATCH** /v1/admin/settings/platform-config | Update platform-wide feature settings
*AdminUsersApi* | [**adminUsersControllerListV1**](docs/AdminUsersApi.md#adminuserscontrollerlistv1) | **GET** /v1/admin/users | List every user across every tenant
*AdminUsersApi* | [**adminUsersControllerToggleActiveV1**](docs/AdminUsersApi.md#adminuserscontrollertoggleactivev1) | **POST** /v1/admin/users/{userId}/toggle-active | Toggle a user\&#39;s active status
*AuthApi* | [**authControllerChangePasswordV1**](docs/AuthApi.md#authcontrollerchangepasswordv1) | **POST** /v1/auth/change-password | Change the current user’s password
*AuthApi* | [**authControllerCompleteGoogleSignupV1**](docs/AuthApi.md#authcontrollercompletegooglesignupv1) | **POST** /v1/auth/google/complete-signup | Finish a Google signup with a business name
*AuthApi* | [**authControllerGoogleAuthorizeV1**](docs/AuthApi.md#authcontrollergoogleauthorizev1) | **GET** /v1/auth/google | Start Google sign-in or signup
*AuthApi* | [**authControllerGoogleCallbackV1**](docs/AuthApi.md#authcontrollergooglecallbackv1) | **GET** /v1/auth/google/callback | Google sign-in callback
*AuthApi* | [**authControllerLoginV1**](docs/AuthApi.md#authcontrollerloginv1) | **POST** /v1/auth/login | Password login
*AuthApi* | [**authControllerLogoutV1**](docs/AuthApi.md#authcontrollerlogoutv1) | **POST** /v1/auth/logout | Revoke every refresh token for the current user
*AuthApi* | [**authControllerMeV1**](docs/AuthApi.md#authcontrollermev1) | **GET** /v1/auth/me | The signed-in tenant user
*AuthApi* | [**authControllerRefreshV1**](docs/AuthApi.md#authcontrollerrefreshv1) | **POST** /v1/auth/refresh | Rotate the refresh token, mint a fresh access token
*AuthApi* | [**authControllerRequestSetPasswordOtpV1**](docs/AuthApi.md#authcontrollerrequestsetpasswordotpv1) | **POST** /v1/auth/set-password/request-otp | Request the OTP required to set a password on a passwordless account
*AuthApi* | [**authControllerResendOtpV1**](docs/AuthApi.md#authcontrollerresendotpv1) | **POST** /v1/auth/resend-verification-otp | Resend a verification OTP
*AuthApi* | [**authControllerSetPasswordV1**](docs/AuthApi.md#authcontrollersetpasswordv1) | **POST** /v1/auth/set-password | Set a password for an account that has never had one
*AuthApi* | [**authControllerSignupV1**](docs/AuthApi.md#authcontrollersignupv1) | **POST** /v1/auth/signup | Owner self-registration (password path)
*AuthApi* | [**authControllerUpdateLocaleV1**](docs/AuthApi.md#authcontrollerupdatelocalev1) | **POST** /v1/auth/locale | Set the language responses are rendered in
*AuthApi* | [**authControllerVerifyEmailV1**](docs/AuthApi.md#authcontrollerverifyemailv1) | **POST** /v1/auth/verify-email | Consume a signup/login verification OTP (password path only)
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
*PromptsApi* | [**promptsControllerCreateVersionV1**](docs/PromptsApi.md#promptscontrollercreateversionv1) | **POST** /v1/prompts/{promptId}/versions | Append a prompt version
*PromptsApi* | [**promptsControllerListV1**](docs/PromptsApi.md#promptscontrollerlistv1) | **GET** /v1/prompts | List tenant prompts
*PromptsApi* | [**promptsControllerUpdateToneV1**](docs/PromptsApi.md#promptscontrollerupdatetonev1) | **PUT** /v1/prompts/{promptId}/tone | Update prompt tone
*ReviewsApi* | [**reviewsControllerGetReviewV1**](docs/ReviewsApi.md#reviewscontrollergetreviewv1) | **GET** /v1/reviews/{reviewId} | One review with every response attached
*ReviewsApi* | [**reviewsControllerListReviewsV1**](docs/ReviewsApi.md#reviewscontrollerlistreviewsv1) | **GET** /v1/reviews | The review queue listing
*SettingsApi* | [**blocklistTermsControllerCreateV1**](docs/SettingsApi.md#blocklisttermscontrollercreatev1) | **POST** /v1/settings/blocklist-terms | Add a blocklist term
*SettingsApi* | [**blocklistTermsControllerListV1**](docs/SettingsApi.md#blocklisttermscontrollerlistv1) | **GET** /v1/settings/blocklist-terms | List blocklist terms
*SettingsApi* | [**blocklistTermsControllerRemoveV1**](docs/SettingsApi.md#blocklisttermscontrollerremovev1) | **DELETE** /v1/settings/blocklist-terms/{id} | Remove a blocklist term
*SettingsApi* | [**platformSettingsControllerGetV1**](docs/SettingsApi.md#platformsettingscontrollergetv1) | **GET** /v1/settings/platform-config | Get platform-wide feature settings
*SettingsApi* | [**tenantSettingsControllerGetV1**](docs/SettingsApi.md#tenantsettingscontrollergetv1) | **GET** /v1/settings | Get tenant settings
*SettingsApi* | [**tenantSettingsControllerReplaceV1**](docs/SettingsApi.md#tenantsettingscontrollerreplacev1) | **PUT** /v1/settings | Replace tenant settings


### Documentation For Models

 - [AdminBusinessResponseDto](docs/AdminBusinessResponseDto.md)
 - [AdminInviteResponseDto](docs/AdminInviteResponseDto.md)
 - [AdminProfileResponseDto](docs/AdminProfileResponseDto.md)
 - [AdminUserResponseDto](docs/AdminUserResponseDto.md)
 - [AuthenticatedUserDto](docs/AuthenticatedUserDto.md)
 - [AvailableLocationDto](docs/AvailableLocationDto.md)
 - [AvailableLocationsResponseDto](docs/AvailableLocationsResponseDto.md)
 - [BackfillProgressResponseDto](docs/BackfillProgressResponseDto.md)
 - [BackfillSummaryDto](docs/BackfillSummaryDto.md)
 - [BlocklistTermDto](docs/BlocklistTermDto.md)
 - [BlocklistTermListResponseDto](docs/BlocklistTermListResponseDto.md)
 - [ChangeAdminPasswordDto](docs/ChangeAdminPasswordDto.md)
 - [ChangePasswordDto](docs/ChangePasswordDto.md)
 - [CompleteGoogleSignupDto](docs/CompleteGoogleSignupDto.md)
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
 - [LatestResponseDto](docs/LatestResponseDto.md)
 - [LocationDto](docs/LocationDto.md)
 - [LocationListResponseDto](docs/LocationListResponseDto.md)
 - [LoginDto](docs/LoginDto.md)
 - [MetricsDto](docs/MetricsDto.md)
 - [PaginationMetaDto](docs/PaginationMetaDto.md)
 - [PlatformActivityResponseDto](docs/PlatformActivityResponseDto.md)
 - [PlatformReviewStatsResponseDto](docs/PlatformReviewStatsResponseDto.md)
 - [PlatformSettingsResponseDto](docs/PlatformSettingsResponseDto.md)
 - [PromptCreatedByDto](docs/PromptCreatedByDto.md)
 - [PromptCurrentVersionDto](docs/PromptCurrentVersionDto.md)
 - [PromptDto](docs/PromptDto.md)
 - [PromptListResponseDto](docs/PromptListResponseDto.md)
 - [PromptVersionDto](docs/PromptVersionDto.md)
 - [RecentEscalatedDto](docs/RecentEscalatedDto.md)
 - [ResendOtpDto](docs/ResendOtpDto.md)
 - [ReviewDetailResponseDto](docs/ReviewDetailResponseDto.md)
 - [ReviewListItemDto](docs/ReviewListItemDto.md)
 - [ReviewListResponseDto](docs/ReviewListResponseDto.md)
 - [ReviewResponseItemDto](docs/ReviewResponseItemDto.md)
 - [ReviewsMetaDto](docs/ReviewsMetaDto.md)
 - [SendAdminInviteDto](docs/SendAdminInviteDto.md)
 - [SetActiveLocationDto](docs/SetActiveLocationDto.md)
 - [SetAdminStatusDto](docs/SetAdminStatusDto.md)
 - [SetPasswordDto](docs/SetPasswordDto.md)
 - [SignupDto](docs/SignupDto.md)
 - [SignupResponseDto](docs/SignupResponseDto.md)
 - [SyncHealthResponseDto](docs/SyncHealthResponseDto.md)
 - [SyncRunDto](docs/SyncRunDto.md)
 - [SyncRunListResponseDto](docs/SyncRunListResponseDto.md)
 - [TenantSettingsResponseDto](docs/TenantSettingsResponseDto.md)
 - [TokenResponseDto](docs/TokenResponseDto.md)
 - [UpdateAdminAvatarDto](docs/UpdateAdminAvatarDto.md)
 - [UpdateBusinessStatusDto](docs/UpdateBusinessStatusDto.md)
 - [UpdateLocaleDto](docs/UpdateLocaleDto.md)
 - [UpdateLocaleResponseDto](docs/UpdateLocaleResponseDto.md)
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

