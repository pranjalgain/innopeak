// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

import type { Configuration } from '../configuration';
import type { AxiosPromise, AxiosInstance, RawAxiosRequestConfig } from 'axios';
import globalAxios from 'axios';
// Some imports not used depending on template conditions
// @ts-ignore
import {
  DUMMY_BASE_URL,
  assertParamExists,
  setApiKeyToObject,
  setBasicAuthToObject,
  setBearerAuthToObject,
  setOAuthToObject,
  setSearchParams,
  serializeDataIfNeeded,
  toPathString,
  createRequestFunction,
  replaceWithSerializableTypeIfNeeded,
} from '../common';
// @ts-ignore
import {
  BASE_PATH,
  COLLECTION_FORMATS,
  type RequestArgs,
  BaseAPI,
  RequiredError,
  operationServerMap,
} from '../base';
// @ts-ignore
import type { AcceptMemberInviteDto } from '../models';
// @ts-ignore
import type { AuthenticatedUserDto } from '../models';
// @ts-ignore
import type { AvatarUploadAuthorizationResponseDto } from '../models';
// @ts-ignore
import type { ChangePasswordDto } from '../models';
// @ts-ignore
import type { CompleteGoogleSignupDto } from '../models';
// @ts-ignore
import type { ConfirmAvatarDto } from '../models';
// @ts-ignore
import type { ConfirmAvatarResponseDto } from '../models';
// @ts-ignore
import type { LoginDto } from '../models';
// @ts-ignore
import type { MemberInvitePreviewDto } from '../models';
// @ts-ignore
import type { ResendOtpDto } from '../models';
// @ts-ignore
import type { SetPasswordDto } from '../models';
// @ts-ignore
import type { SignupDto } from '../models';
// @ts-ignore
import type { SignupResponseDto } from '../models';
// @ts-ignore
import type { TokenResponseDto } from '../models';
// @ts-ignore
import type { UpdateLocaleDto } from '../models';
// @ts-ignore
import type { UpdateLocaleResponseDto } from '../models';
// @ts-ignore
import type { VerifyEmailDto } from '../models';
/**
 * AuthApi - axios parameter creator
 */
export const AuthApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Sets `users.name`/`password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap, so a double-submit cannot redeem the same token twice. Signs the member in on success, same shape as `POST /v1/auth/login`. See `GET /v1/auth/invite/:token/google` for the SSO alternative.
     * @summary Accept a tenant-member invite by setting a name and password
     * @param {AcceptMemberInviteDto} acceptMemberInviteDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerAcceptMemberInviteV1: async (
      acceptMemberInviteDto: AcceptMemberInviteDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'acceptMemberInviteDto' is not null or undefined
      assertParamExists(
        'authControllerAcceptMemberInviteV1',
        'acceptMemberInviteDto',
        acceptMemberInviteDto,
      );
      const localVarPath = `/v1/auth/invite/accept`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        acceptMemberInviteDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Requires the current password. Updates `users.password_hash`, revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Other sessions die. Tenant-user tokens only. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
     * @summary Change the current user’s password
     * @param {ChangePasswordDto} changePasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerChangePasswordV1: async (
      changePasswordDto: ChangePasswordDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'changePasswordDto' is not null or undefined
      assertParamExists(
        'authControllerChangePasswordV1',
        'changePasswordDto',
        changePasswordDto,
      );
      const localVarPath = `/v1/auth/change-password`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        changePasswordDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Only reachable after the callback set a `google_pending_signup` cookie for a genuinely new person — Google returns a person, not a business, and `tenants.name` is NOT NULL. Creates the tenant + owner + settings + default prompts and issues session cookies, same as every other successful auth endpoint (unlike the two Google endpoints above, this is a normal XHR call, not a redirect).
     * @summary Finish a Google signup with a business name
     * @param {CompleteGoogleSignupDto} completeGoogleSignupDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerCompleteGoogleSignupV1: async (
      completeGoogleSignupDto: CompleteGoogleSignupDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'completeGoogleSignupDto' is not null or undefined
      assertParamExists(
        'authControllerCompleteGoogleSignupV1',
        'completeGoogleSignupDto',
        completeGoogleSignupDto,
      );
      const localVarPath = `/v1/auth/google/complete-signup`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        completeGoogleSignupDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Redirects (302) to Google\'s consent screen and sets the `google_auth_sid` cookie that binds the round trip to this browser. Not an XHR endpoint — the SPA navigates here, so the response is a redirect rather than JSON. Carries no business name: a genuinely new signup collects one afterward, at `POST /v1/auth/google/complete-signup`.
     * @summary Start Google sign-in or signup
     * @param {AuthControllerGoogleAuthorizeV1IntentEnum} intent Which button started this. &#x60;signup&#x60; may end in a new tenant; &#x60;login&#x60; never creates one and rejects an unknown identity with &#x60;?error&#x3D;NO_ACCOUNT&#x60;. Neither carries a business name here — see &#x60;POST /v1/auth/google/complete-signup&#x60;, which is where a genuinely new signup supplies one, after Google has already verified the identity. Accepting a platform-admin invite through Google is NOT one of these — that has its own route, &#x60;GET /v1/auth/invite/:token/google&#x60;, which carries the invite token.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerGoogleAuthorizeV1: async (
      intent: AuthControllerGoogleAuthorizeV1IntentEnum,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'intent' is not null or undefined
      assertParamExists('authControllerGoogleAuthorizeV1', 'intent', intent);
      const localVarPath = `/v1/auth/google`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'GET',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      if (intent !== undefined) {
        localVarQueryParameter['intent'] = intent;
      }

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Where Google returns the browser. Consumes the one-time state *before* exchanging the code, then resolves the identity: a known `user_identities` row signs in; a matching email links the identity and signs in; neither, under `intent=login`, is `?error=NO_ACCOUNT`; neither, under `intent=signup`, sets a `google_pending_signup` cookie and redirects to /onboarding/business-name to collect the one thing Google cannot supply. Always a 302 — success sets the session cookies, every failure appends `?error=` to /login or /onboarding/signup, because a JSON body would paint as a document here.
     * @summary Google sign-in callback
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerGoogleCallbackV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/auth/google/callback`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'GET',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * The SSO alternative to `POST /v1/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `user_identities` row yet for that callback branch to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
     * @summary Accept a tenant-member invite via Google
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerInviteGoogleAuthorizeV1: async (
      token: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'token' is not null or undefined
      assertParamExists(
        'authControllerInviteGoogleAuthorizeV1',
        'token',
        token,
      );
      const localVarPath = `/v1/auth/invite/{token}/google`.replace(
        '{token}',
        encodeURIComponent(String(token)),
      );
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'GET',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Tenant-user login only — platform admins have their own route, `POST /v1/admin/auth/login` (see `separate-admin-login-design.md` for why the two were split apart). A still-`pending_verification` account is not an error here: credentials are checked first, and on success a fresh OTP is sent and a `pending_verification` result is returned instead of tokens — the frontend renders the same OTP stepper the signup wizard uses. `disabled`/`suspended` accounts fail with 403. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
     * @summary Password login
     * @param {LoginDto} loginDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerLoginV1: async (
      loginDto: LoginDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'loginDto' is not null or undefined
      assertParamExists('authControllerLoginV1', 'loginDto', loginDto);
      const localVarPath = `/v1/auth/login`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        loginDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * All sessions/devices — a single-session logout is intentionally not offered separately. Also clears the `refresh_token` cookie for the caller.
     * @summary Revoke every refresh token for the current user
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerLogoutV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/auth/logout`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * The authoritative profile for the current access token — name, email, role, the tenant name, and whether a password is set. Settings reads this rather than reassembling it from client-side storage, which could not answer either question for a Google sign-in (a redirect-only flow that never returns a JSON body to the SPA).
     * @summary The signed-in tenant user
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerMeV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/auth/me`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'GET',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * No request body — the refresh token comes from the httpOnly `refresh_token` cookie (set by login/verify-email/a prior refresh), never from a payload a script could construct. Single-use rotation: the presented refresh token is revoked in the same call a new pair is issued (and the cookie replaced). Re-checks the owning user/tenant standing every time (disabled/suspended revokes every refresh token that user has). Re-presenting an already-spent token is judged by age: within a short grace window it is treated as a lost two-tab race and the session is preserved; older than that, every refresh token for that user is revoked as suspected reuse of a leaked token.
     * @summary Rotate the refresh token, mint a fresh access token
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerRefreshV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/auth/refresh`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Step-up verification ahead of POST /v1/auth/set-password: emails a 6-digit code to the caller\'s own address, proving live mailbox control rather than just possession of an access token. Same cooldown/attempt-budget shape as the signup/login OTP. 400s if the account already has a password.
     * @summary Request the OTP required to set a password on a passwordless account
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerRequestSetPasswordOtpV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/auth/set-password/request-otp`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * The OTP stepper\'s \"Resend\" button — doesn\'t collect a password (unlike login), so it always returns the same generic acknowledgement whether or not the email matches a pending_verification account, same enumeration-prevention shape as forgot-password.
     * @summary Resend a verification OTP
     * @param {ResendOtpDto} resendOtpDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerResendOtpV1: async (
      resendOtpDto: ResendOtpDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'resendOtpDto' is not null or undefined
      assertParamExists(
        'authControllerResendOtpV1',
        'resendOtpDto',
        resendOtpDto,
      );
      const localVarPath = `/v1/auth/resend-verification-otp`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        resendOtpDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * For a Google/SSO-only account (`users.password_hash IS NULL`) — no current password to prove, so unlike POST /v1/auth/change-password this takes `otp` (from POST /v1/auth/set-password/request-otp) instead. Revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Tenant-user tokens only. 400s if the account already has a password, or if the OTP is missing/expired/wrong — use change-password instead in the former case.
     * @summary Set a password for an account that has never had one
     * @param {SetPasswordDto} setPasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerSetPasswordV1: async (
      setPasswordDto: SetPasswordDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'setPasswordDto' is not null or undefined
      assertParamExists(
        'authControllerSetPasswordV1',
        'setPasswordDto',
        setPasswordDto,
      );
      const localVarPath = `/v1/auth/set-password`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        setPasswordDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Creates the tenant, owner, and default settings together, then emails a 6-digit verification code (no link — see POST /v1/auth/verify-email). Fails with 409 if this email is already registered, under any status or tenant. `businessName` is the tenant/company name — required, and distinct from a `locations.name` (the per-location name synced later from a connected Google Business Profile).
     * @summary Owner self-registration (password path)
     * @param {SignupDto} signupDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerSignupV1: async (
      signupDto: SignupDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'signupDto' is not null or undefined
      assertParamExists('authControllerSignupV1', 'signupDto', signupDto);
      const localVarPath = `/v1/auth/signup`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        signupDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Persists `users.locale`, then re-signs *only* the access token so the new value is on its `locale` claim immediately — this tab\'s own requests read the new language right away rather than waiting for the access token to expire and refresh. Deliberately does not touch the refresh token (unlike change-password/set-password): a locale preference is not proof of anything beyond what the caller\'s existing access token already proves, so this must not be usable to mint a fresh 7-day refresh token from one. Another signed-in tab simply keeps its own locale until it next refreshes. Tenant-user tokens only.
     * @summary Set the language responses are rendered in
     * @param {UpdateLocaleDto} updateLocaleDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerUpdateLocaleV1: async (
      updateLocaleDto: UpdateLocaleDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'updateLocaleDto' is not null or undefined
      assertParamExists(
        'authControllerUpdateLocaleV1',
        'updateLocaleDto',
        updateLocaleDto,
      );
      const localVarPath = `/v1/auth/locale`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        updateLocaleDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a name and password, without spending the token. Same generic 404 for a token that never existed, was already used, or has expired as the platform-admin equivalent.
     * @summary Preview a tenant-member invite
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerValidateMemberInviteV1: async (
      token: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'token' is not null or undefined
      assertParamExists('authControllerValidateMemberInviteV1', 'token', token);
      const localVarPath = `/v1/auth/invite/{token}`.replace(
        '{token}',
        encodeURIComponent(String(token)),
      );
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'GET',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Marks the code used, activates the user, and — since reaching this screen already proved the caller knows the account password (either just set at signup or just typed at login) — issues a token pair, same as a successful login. Same INVALID_OR_EXPIRED_OTP error for a code that never existed, was already used, expired, or belongs to an account no longer pending_verification — never distinguished (Security considerations). The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body — only `accessToken` is.
     * @summary Consume a signup/login verification OTP (password path only)
     * @param {VerifyEmailDto} verifyEmailDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerVerifyEmailV1: async (
      verifyEmailDto: VerifyEmailDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'verifyEmailDto' is not null or undefined
      assertParamExists(
        'authControllerVerifyEmailV1',
        'verifyEmailDto',
        verifyEmailDto,
      );
      const localVarPath = `/v1/auth/verify-email`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        verifyEmailDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below. Tenant-user tokens only.
     * @summary Get a signed avatar upload authorization
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantAvatarControllerAuthorizeV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/auth/avatar/authorize`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this user\'s current avatar — replacing any previous one. Tenant-user tokens only.
     * @summary Confirm an uploaded avatar
     * @param {ConfirmAvatarDto} confirmAvatarDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantAvatarControllerConfirmAvatarV1: async (
      confirmAvatarDto: ConfirmAvatarDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'confirmAvatarDto' is not null or undefined
      assertParamExists(
        'tenantAvatarControllerConfirmAvatarV1',
        'confirmAvatarDto',
        confirmAvatarDto,
      );
      const localVarPath = `/v1/auth/avatar/confirm`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'POST',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      localVarHeaderParameter['Content-Type'] = 'application/json';
      localVarHeaderParameter['Accept'] = 'application/json';

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        confirmAvatarDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
  };
};

/**
 * AuthApi - functional programming interface
 */
export const AuthApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = AuthApiAxiosParamCreator(configuration);
  return {
    /**
     * Sets `users.name`/`password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap, so a double-submit cannot redeem the same token twice. Signs the member in on success, same shape as `POST /v1/auth/login`. See `GET /v1/auth/invite/:token/google` for the SSO alternative.
     * @summary Accept a tenant-member invite by setting a name and password
     * @param {AcceptMemberInviteDto} acceptMemberInviteDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerAcceptMemberInviteV1(
      acceptMemberInviteDto: AcceptMemberInviteDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TokenResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerAcceptMemberInviteV1(
          acceptMemberInviteDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerAcceptMemberInviteV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Requires the current password. Updates `users.password_hash`, revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Other sessions die. Tenant-user tokens only. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
     * @summary Change the current user’s password
     * @param {ChangePasswordDto} changePasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerChangePasswordV1(
      changePasswordDto: ChangePasswordDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TokenResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerChangePasswordV1(
          changePasswordDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerChangePasswordV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Only reachable after the callback set a `google_pending_signup` cookie for a genuinely new person — Google returns a person, not a business, and `tenants.name` is NOT NULL. Creates the tenant + owner + settings + default prompts and issues session cookies, same as every other successful auth endpoint (unlike the two Google endpoints above, this is a normal XHR call, not a redirect).
     * @summary Finish a Google signup with a business name
     * @param {CompleteGoogleSignupDto} completeGoogleSignupDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerCompleteGoogleSignupV1(
      completeGoogleSignupDto: CompleteGoogleSignupDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<any>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerCompleteGoogleSignupV1(
          completeGoogleSignupDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerCompleteGoogleSignupV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Redirects (302) to Google\'s consent screen and sets the `google_auth_sid` cookie that binds the round trip to this browser. Not an XHR endpoint — the SPA navigates here, so the response is a redirect rather than JSON. Carries no business name: a genuinely new signup collects one afterward, at `POST /v1/auth/google/complete-signup`.
     * @summary Start Google sign-in or signup
     * @param {AuthControllerGoogleAuthorizeV1IntentEnum} intent Which button started this. &#x60;signup&#x60; may end in a new tenant; &#x60;login&#x60; never creates one and rejects an unknown identity with &#x60;?error&#x3D;NO_ACCOUNT&#x60;. Neither carries a business name here — see &#x60;POST /v1/auth/google/complete-signup&#x60;, which is where a genuinely new signup supplies one, after Google has already verified the identity. Accepting a platform-admin invite through Google is NOT one of these — that has its own route, &#x60;GET /v1/auth/invite/:token/google&#x60;, which carries the invite token.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerGoogleAuthorizeV1(
      intent: AuthControllerGoogleAuthorizeV1IntentEnum,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerGoogleAuthorizeV1(
          intent,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerGoogleAuthorizeV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Where Google returns the browser. Consumes the one-time state *before* exchanging the code, then resolves the identity: a known `user_identities` row signs in; a matching email links the identity and signs in; neither, under `intent=login`, is `?error=NO_ACCOUNT`; neither, under `intent=signup`, sets a `google_pending_signup` cookie and redirects to /onboarding/business-name to collect the one thing Google cannot supply. Always a 302 — success sets the session cookies, every failure appends `?error=` to /login or /onboarding/signup, because a JSON body would paint as a document here.
     * @summary Google sign-in callback
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerGoogleCallbackV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerGoogleCallbackV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerGoogleCallbackV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * The SSO alternative to `POST /v1/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `user_identities` row yet for that callback branch to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
     * @summary Accept a tenant-member invite via Google
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerInviteGoogleAuthorizeV1(
      token: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerInviteGoogleAuthorizeV1(
          token,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerInviteGoogleAuthorizeV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Tenant-user login only — platform admins have their own route, `POST /v1/admin/auth/login` (see `separate-admin-login-design.md` for why the two were split apart). A still-`pending_verification` account is not an error here: credentials are checked first, and on success a fresh OTP is sent and a `pending_verification` result is returned instead of tokens — the frontend renders the same OTP stepper the signup wizard uses. `disabled`/`suspended` accounts fail with 403. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
     * @summary Password login
     * @param {LoginDto} loginDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerLoginV1(
      loginDto: LoginDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TokenResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerLoginV1(
          loginDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerLoginV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * All sessions/devices — a single-session logout is intentionally not offered separately. Also clears the `refresh_token` cookie for the caller.
     * @summary Revoke every refresh token for the current user
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerLogoutV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerLogoutV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerLogoutV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * The authoritative profile for the current access token — name, email, role, the tenant name, and whether a password is set. Settings reads this rather than reassembling it from client-side storage, which could not answer either question for a Google sign-in (a redirect-only flow that never returns a JSON body to the SPA).
     * @summary The signed-in tenant user
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerMeV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AuthenticatedUserDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerMeV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerMeV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * No request body — the refresh token comes from the httpOnly `refresh_token` cookie (set by login/verify-email/a prior refresh), never from a payload a script could construct. Single-use rotation: the presented refresh token is revoked in the same call a new pair is issued (and the cookie replaced). Re-checks the owning user/tenant standing every time (disabled/suspended revokes every refresh token that user has). Re-presenting an already-spent token is judged by age: within a short grace window it is treated as a lost two-tab race and the session is preserved; older than that, every refresh token for that user is revoked as suspected reuse of a leaked token.
     * @summary Rotate the refresh token, mint a fresh access token
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerRefreshV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TokenResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerRefreshV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerRefreshV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Step-up verification ahead of POST /v1/auth/set-password: emails a 6-digit code to the caller\'s own address, proving live mailbox control rather than just possession of an access token. Same cooldown/attempt-budget shape as the signup/login OTP. 400s if the account already has a password.
     * @summary Request the OTP required to set a password on a passwordless account
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerRequestSetPasswordOtpV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerRequestSetPasswordOtpV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerRequestSetPasswordOtpV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * The OTP stepper\'s \"Resend\" button — doesn\'t collect a password (unlike login), so it always returns the same generic acknowledgement whether or not the email matches a pending_verification account, same enumeration-prevention shape as forgot-password.
     * @summary Resend a verification OTP
     * @param {ResendOtpDto} resendOtpDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerResendOtpV1(
      resendOtpDto: ResendOtpDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerResendOtpV1(
          resendOtpDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerResendOtpV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * For a Google/SSO-only account (`users.password_hash IS NULL`) — no current password to prove, so unlike POST /v1/auth/change-password this takes `otp` (from POST /v1/auth/set-password/request-otp) instead. Revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Tenant-user tokens only. 400s if the account already has a password, or if the OTP is missing/expired/wrong — use change-password instead in the former case.
     * @summary Set a password for an account that has never had one
     * @param {SetPasswordDto} setPasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerSetPasswordV1(
      setPasswordDto: SetPasswordDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TokenResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerSetPasswordV1(
          setPasswordDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerSetPasswordV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Creates the tenant, owner, and default settings together, then emails a 6-digit verification code (no link — see POST /v1/auth/verify-email). Fails with 409 if this email is already registered, under any status or tenant. `businessName` is the tenant/company name — required, and distinct from a `locations.name` (the per-location name synced later from a connected Google Business Profile).
     * @summary Owner self-registration (password path)
     * @param {SignupDto} signupDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerSignupV1(
      signupDto: SignupDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<SignupResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerSignupV1(
          signupDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerSignupV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Persists `users.locale`, then re-signs *only* the access token so the new value is on its `locale` claim immediately — this tab\'s own requests read the new language right away rather than waiting for the access token to expire and refresh. Deliberately does not touch the refresh token (unlike change-password/set-password): a locale preference is not proof of anything beyond what the caller\'s existing access token already proves, so this must not be usable to mint a fresh 7-day refresh token from one. Another signed-in tab simply keeps its own locale until it next refreshes. Tenant-user tokens only.
     * @summary Set the language responses are rendered in
     * @param {UpdateLocaleDto} updateLocaleDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerUpdateLocaleV1(
      updateLocaleDto: UpdateLocaleDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<UpdateLocaleResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerUpdateLocaleV1(
          updateLocaleDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerUpdateLocaleV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a name and password, without spending the token. Same generic 404 for a token that never existed, was already used, or has expired as the platform-admin equivalent.
     * @summary Preview a tenant-member invite
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerValidateMemberInviteV1(
      token: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<MemberInvitePreviewDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerValidateMemberInviteV1(
          token,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerValidateMemberInviteV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Marks the code used, activates the user, and — since reaching this screen already proved the caller knows the account password (either just set at signup or just typed at login) — issues a token pair, same as a successful login. Same INVALID_OR_EXPIRED_OTP error for a code that never existed, was already used, expired, or belongs to an account no longer pending_verification — never distinguished (Security considerations). The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body — only `accessToken` is.
     * @summary Consume a signup/login verification OTP (password path only)
     * @param {VerifyEmailDto} verifyEmailDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async authControllerVerifyEmailV1(
      verifyEmailDto: VerifyEmailDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TokenResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.authControllerVerifyEmailV1(
          verifyEmailDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.authControllerVerifyEmailV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below. Tenant-user tokens only.
     * @summary Get a signed avatar upload authorization
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async tenantAvatarControllerAuthorizeV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AvatarUploadAuthorizationResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.tenantAvatarControllerAuthorizeV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.tenantAvatarControllerAuthorizeV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this user\'s current avatar — replacing any previous one. Tenant-user tokens only.
     * @summary Confirm an uploaded avatar
     * @param {ConfirmAvatarDto} confirmAvatarDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async tenantAvatarControllerConfirmAvatarV1(
      confirmAvatarDto: ConfirmAvatarDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ConfirmAvatarResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.tenantAvatarControllerConfirmAvatarV1(
          confirmAvatarDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AuthApi.tenantAvatarControllerConfirmAvatarV1']?.[
          localVarOperationServerIndex
        ]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
  };
};

/**
 * AuthApi - factory interface
 */
export const AuthApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AuthApiFp(configuration);
  return {
    /**
     * Sets `users.name`/`password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap, so a double-submit cannot redeem the same token twice. Signs the member in on success, same shape as `POST /v1/auth/login`. See `GET /v1/auth/invite/:token/google` for the SSO alternative.
     * @summary Accept a tenant-member invite by setting a name and password
     * @param {AuthApiAuthControllerAcceptMemberInviteV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerAcceptMemberInviteV1(
      requestParameters: AuthApiAuthControllerAcceptMemberInviteV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TokenResponseDto> {
      return localVarFp
        .authControllerAcceptMemberInviteV1(
          requestParameters.acceptMemberInviteDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Requires the current password. Updates `users.password_hash`, revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Other sessions die. Tenant-user tokens only. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
     * @summary Change the current user’s password
     * @param {AuthApiAuthControllerChangePasswordV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerChangePasswordV1(
      requestParameters: AuthApiAuthControllerChangePasswordV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TokenResponseDto> {
      return localVarFp
        .authControllerChangePasswordV1(
          requestParameters.changePasswordDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Only reachable after the callback set a `google_pending_signup` cookie for a genuinely new person — Google returns a person, not a business, and `tenants.name` is NOT NULL. Creates the tenant + owner + settings + default prompts and issues session cookies, same as every other successful auth endpoint (unlike the two Google endpoints above, this is a normal XHR call, not a redirect).
     * @summary Finish a Google signup with a business name
     * @param {AuthApiAuthControllerCompleteGoogleSignupV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerCompleteGoogleSignupV1(
      requestParameters: AuthApiAuthControllerCompleteGoogleSignupV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<any> {
      return localVarFp
        .authControllerCompleteGoogleSignupV1(
          requestParameters.completeGoogleSignupDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Redirects (302) to Google\'s consent screen and sets the `google_auth_sid` cookie that binds the round trip to this browser. Not an XHR endpoint — the SPA navigates here, so the response is a redirect rather than JSON. Carries no business name: a genuinely new signup collects one afterward, at `POST /v1/auth/google/complete-signup`.
     * @summary Start Google sign-in or signup
     * @param {AuthApiAuthControllerGoogleAuthorizeV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerGoogleAuthorizeV1(
      requestParameters: AuthApiAuthControllerGoogleAuthorizeV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .authControllerGoogleAuthorizeV1(requestParameters.intent, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Where Google returns the browser. Consumes the one-time state *before* exchanging the code, then resolves the identity: a known `user_identities` row signs in; a matching email links the identity and signs in; neither, under `intent=login`, is `?error=NO_ACCOUNT`; neither, under `intent=signup`, sets a `google_pending_signup` cookie and redirects to /onboarding/business-name to collect the one thing Google cannot supply. Always a 302 — success sets the session cookies, every failure appends `?error=` to /login or /onboarding/signup, because a JSON body would paint as a document here.
     * @summary Google sign-in callback
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerGoogleCallbackV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .authControllerGoogleCallbackV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The SSO alternative to `POST /v1/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `user_identities` row yet for that callback branch to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
     * @summary Accept a tenant-member invite via Google
     * @param {AuthApiAuthControllerInviteGoogleAuthorizeV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerInviteGoogleAuthorizeV1(
      requestParameters: AuthApiAuthControllerInviteGoogleAuthorizeV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .authControllerInviteGoogleAuthorizeV1(requestParameters.token, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Tenant-user login only — platform admins have their own route, `POST /v1/admin/auth/login` (see `separate-admin-login-design.md` for why the two were split apart). A still-`pending_verification` account is not an error here: credentials are checked first, and on success a fresh OTP is sent and a `pending_verification` result is returned instead of tokens — the frontend renders the same OTP stepper the signup wizard uses. `disabled`/`suspended` accounts fail with 403. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
     * @summary Password login
     * @param {AuthApiAuthControllerLoginV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerLoginV1(
      requestParameters: AuthApiAuthControllerLoginV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TokenResponseDto> {
      return localVarFp
        .authControllerLoginV1(requestParameters.loginDto, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * All sessions/devices — a single-session logout is intentionally not offered separately. Also clears the `refresh_token` cookie for the caller.
     * @summary Revoke every refresh token for the current user
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerLogoutV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .authControllerLogoutV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The authoritative profile for the current access token — name, email, role, the tenant name, and whether a password is set. Settings reads this rather than reassembling it from client-side storage, which could not answer either question for a Google sign-in (a redirect-only flow that never returns a JSON body to the SPA).
     * @summary The signed-in tenant user
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerMeV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AuthenticatedUserDto> {
      return localVarFp
        .authControllerMeV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * No request body — the refresh token comes from the httpOnly `refresh_token` cookie (set by login/verify-email/a prior refresh), never from a payload a script could construct. Single-use rotation: the presented refresh token is revoked in the same call a new pair is issued (and the cookie replaced). Re-checks the owning user/tenant standing every time (disabled/suspended revokes every refresh token that user has). Re-presenting an already-spent token is judged by age: within a short grace window it is treated as a lost two-tab race and the session is preserved; older than that, every refresh token for that user is revoked as suspected reuse of a leaked token.
     * @summary Rotate the refresh token, mint a fresh access token
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerRefreshV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TokenResponseDto> {
      return localVarFp
        .authControllerRefreshV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Step-up verification ahead of POST /v1/auth/set-password: emails a 6-digit code to the caller\'s own address, proving live mailbox control rather than just possession of an access token. Same cooldown/attempt-budget shape as the signup/login OTP. 400s if the account already has a password.
     * @summary Request the OTP required to set a password on a passwordless account
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerRequestSetPasswordOtpV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .authControllerRequestSetPasswordOtpV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The OTP stepper\'s \"Resend\" button — doesn\'t collect a password (unlike login), so it always returns the same generic acknowledgement whether or not the email matches a pending_verification account, same enumeration-prevention shape as forgot-password.
     * @summary Resend a verification OTP
     * @param {AuthApiAuthControllerResendOtpV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerResendOtpV1(
      requestParameters: AuthApiAuthControllerResendOtpV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .authControllerResendOtpV1(requestParameters.resendOtpDto, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * For a Google/SSO-only account (`users.password_hash IS NULL`) — no current password to prove, so unlike POST /v1/auth/change-password this takes `otp` (from POST /v1/auth/set-password/request-otp) instead. Revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Tenant-user tokens only. 400s if the account already has a password, or if the OTP is missing/expired/wrong — use change-password instead in the former case.
     * @summary Set a password for an account that has never had one
     * @param {AuthApiAuthControllerSetPasswordV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerSetPasswordV1(
      requestParameters: AuthApiAuthControllerSetPasswordV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TokenResponseDto> {
      return localVarFp
        .authControllerSetPasswordV1(requestParameters.setPasswordDto, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Creates the tenant, owner, and default settings together, then emails a 6-digit verification code (no link — see POST /v1/auth/verify-email). Fails with 409 if this email is already registered, under any status or tenant. `businessName` is the tenant/company name — required, and distinct from a `locations.name` (the per-location name synced later from a connected Google Business Profile).
     * @summary Owner self-registration (password path)
     * @param {AuthApiAuthControllerSignupV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerSignupV1(
      requestParameters: AuthApiAuthControllerSignupV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<SignupResponseDto> {
      return localVarFp
        .authControllerSignupV1(requestParameters.signupDto, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Persists `users.locale`, then re-signs *only* the access token so the new value is on its `locale` claim immediately — this tab\'s own requests read the new language right away rather than waiting for the access token to expire and refresh. Deliberately does not touch the refresh token (unlike change-password/set-password): a locale preference is not proof of anything beyond what the caller\'s existing access token already proves, so this must not be usable to mint a fresh 7-day refresh token from one. Another signed-in tab simply keeps its own locale until it next refreshes. Tenant-user tokens only.
     * @summary Set the language responses are rendered in
     * @param {AuthApiAuthControllerUpdateLocaleV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerUpdateLocaleV1(
      requestParameters: AuthApiAuthControllerUpdateLocaleV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<UpdateLocaleResponseDto> {
      return localVarFp
        .authControllerUpdateLocaleV1(
          requestParameters.updateLocaleDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a name and password, without spending the token. Same generic 404 for a token that never existed, was already used, or has expired as the platform-admin equivalent.
     * @summary Preview a tenant-member invite
     * @param {AuthApiAuthControllerValidateMemberInviteV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerValidateMemberInviteV1(
      requestParameters: AuthApiAuthControllerValidateMemberInviteV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<MemberInvitePreviewDto> {
      return localVarFp
        .authControllerValidateMemberInviteV1(requestParameters.token, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Marks the code used, activates the user, and — since reaching this screen already proved the caller knows the account password (either just set at signup or just typed at login) — issues a token pair, same as a successful login. Same INVALID_OR_EXPIRED_OTP error for a code that never existed, was already used, expired, or belongs to an account no longer pending_verification — never distinguished (Security considerations). The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body — only `accessToken` is.
     * @summary Consume a signup/login verification OTP (password path only)
     * @param {AuthApiAuthControllerVerifyEmailV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    authControllerVerifyEmailV1(
      requestParameters: AuthApiAuthControllerVerifyEmailV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TokenResponseDto> {
      return localVarFp
        .authControllerVerifyEmailV1(requestParameters.verifyEmailDto, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below. Tenant-user tokens only.
     * @summary Get a signed avatar upload authorization
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantAvatarControllerAuthorizeV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AvatarUploadAuthorizationResponseDto> {
      return localVarFp
        .tenantAvatarControllerAuthorizeV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this user\'s current avatar — replacing any previous one. Tenant-user tokens only.
     * @summary Confirm an uploaded avatar
     * @param {AuthApiTenantAvatarControllerConfirmAvatarV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantAvatarControllerConfirmAvatarV1(
      requestParameters: AuthApiTenantAvatarControllerConfirmAvatarV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ConfirmAvatarResponseDto> {
      return localVarFp
        .tenantAvatarControllerConfirmAvatarV1(
          requestParameters.confirmAvatarDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AuthApi - interface
 */
export interface AuthApiInterface {
  /**
   * Sets `users.name`/`password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap, so a double-submit cannot redeem the same token twice. Signs the member in on success, same shape as `POST /v1/auth/login`. See `GET /v1/auth/invite/:token/google` for the SSO alternative.
   * @summary Accept a tenant-member invite by setting a name and password
   * @param {AuthApiAuthControllerAcceptMemberInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerAcceptMemberInviteV1(
    requestParameters: AuthApiAuthControllerAcceptMemberInviteV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TokenResponseDto>;

  /**
   * Requires the current password. Updates `users.password_hash`, revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Other sessions die. Tenant-user tokens only. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
   * @summary Change the current user’s password
   * @param {AuthApiAuthControllerChangePasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerChangePasswordV1(
    requestParameters: AuthApiAuthControllerChangePasswordV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TokenResponseDto>;

  /**
   * Only reachable after the callback set a `google_pending_signup` cookie for a genuinely new person — Google returns a person, not a business, and `tenants.name` is NOT NULL. Creates the tenant + owner + settings + default prompts and issues session cookies, same as every other successful auth endpoint (unlike the two Google endpoints above, this is a normal XHR call, not a redirect).
   * @summary Finish a Google signup with a business name
   * @param {AuthApiAuthControllerCompleteGoogleSignupV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerCompleteGoogleSignupV1(
    requestParameters: AuthApiAuthControllerCompleteGoogleSignupV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<any>;

  /**
   * Redirects (302) to Google\'s consent screen and sets the `google_auth_sid` cookie that binds the round trip to this browser. Not an XHR endpoint — the SPA navigates here, so the response is a redirect rather than JSON. Carries no business name: a genuinely new signup collects one afterward, at `POST /v1/auth/google/complete-signup`.
   * @summary Start Google sign-in or signup
   * @param {AuthApiAuthControllerGoogleAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerGoogleAuthorizeV1(
    requestParameters: AuthApiAuthControllerGoogleAuthorizeV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Where Google returns the browser. Consumes the one-time state *before* exchanging the code, then resolves the identity: a known `user_identities` row signs in; a matching email links the identity and signs in; neither, under `intent=login`, is `?error=NO_ACCOUNT`; neither, under `intent=signup`, sets a `google_pending_signup` cookie and redirects to /onboarding/business-name to collect the one thing Google cannot supply. Always a 302 — success sets the session cookies, every failure appends `?error=` to /login or /onboarding/signup, because a JSON body would paint as a document here.
   * @summary Google sign-in callback
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerGoogleCallbackV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * The SSO alternative to `POST /v1/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `user_identities` row yet for that callback branch to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
   * @summary Accept a tenant-member invite via Google
   * @param {AuthApiAuthControllerInviteGoogleAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerInviteGoogleAuthorizeV1(
    requestParameters: AuthApiAuthControllerInviteGoogleAuthorizeV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Tenant-user login only — platform admins have their own route, `POST /v1/admin/auth/login` (see `separate-admin-login-design.md` for why the two were split apart). A still-`pending_verification` account is not an error here: credentials are checked first, and on success a fresh OTP is sent and a `pending_verification` result is returned instead of tokens — the frontend renders the same OTP stepper the signup wizard uses. `disabled`/`suspended` accounts fail with 403. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
   * @summary Password login
   * @param {AuthApiAuthControllerLoginV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerLoginV1(
    requestParameters: AuthApiAuthControllerLoginV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TokenResponseDto>;

  /**
   * All sessions/devices — a single-session logout is intentionally not offered separately. Also clears the `refresh_token` cookie for the caller.
   * @summary Revoke every refresh token for the current user
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerLogoutV1(options?: RawAxiosRequestConfig): AxiosPromise<void>;

  /**
   * The authoritative profile for the current access token — name, email, role, the tenant name, and whether a password is set. Settings reads this rather than reassembling it from client-side storage, which could not answer either question for a Google sign-in (a redirect-only flow that never returns a JSON body to the SPA).
   * @summary The signed-in tenant user
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerMeV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AuthenticatedUserDto>;

  /**
   * No request body — the refresh token comes from the httpOnly `refresh_token` cookie (set by login/verify-email/a prior refresh), never from a payload a script could construct. Single-use rotation: the presented refresh token is revoked in the same call a new pair is issued (and the cookie replaced). Re-checks the owning user/tenant standing every time (disabled/suspended revokes every refresh token that user has). Re-presenting an already-spent token is judged by age: within a short grace window it is treated as a lost two-tab race and the session is preserved; older than that, every refresh token for that user is revoked as suspected reuse of a leaked token.
   * @summary Rotate the refresh token, mint a fresh access token
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerRefreshV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TokenResponseDto>;

  /**
   * Step-up verification ahead of POST /v1/auth/set-password: emails a 6-digit code to the caller\'s own address, proving live mailbox control rather than just possession of an access token. Same cooldown/attempt-budget shape as the signup/login OTP. 400s if the account already has a password.
   * @summary Request the OTP required to set a password on a passwordless account
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerRequestSetPasswordOtpV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * The OTP stepper\'s \"Resend\" button — doesn\'t collect a password (unlike login), so it always returns the same generic acknowledgement whether or not the email matches a pending_verification account, same enumeration-prevention shape as forgot-password.
   * @summary Resend a verification OTP
   * @param {AuthApiAuthControllerResendOtpV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerResendOtpV1(
    requestParameters: AuthApiAuthControllerResendOtpV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * For a Google/SSO-only account (`users.password_hash IS NULL`) — no current password to prove, so unlike POST /v1/auth/change-password this takes `otp` (from POST /v1/auth/set-password/request-otp) instead. Revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Tenant-user tokens only. 400s if the account already has a password, or if the OTP is missing/expired/wrong — use change-password instead in the former case.
   * @summary Set a password for an account that has never had one
   * @param {AuthApiAuthControllerSetPasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerSetPasswordV1(
    requestParameters: AuthApiAuthControllerSetPasswordV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TokenResponseDto>;

  /**
   * Creates the tenant, owner, and default settings together, then emails a 6-digit verification code (no link — see POST /v1/auth/verify-email). Fails with 409 if this email is already registered, under any status or tenant. `businessName` is the tenant/company name — required, and distinct from a `locations.name` (the per-location name synced later from a connected Google Business Profile).
   * @summary Owner self-registration (password path)
   * @param {AuthApiAuthControllerSignupV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerSignupV1(
    requestParameters: AuthApiAuthControllerSignupV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<SignupResponseDto>;

  /**
   * Persists `users.locale`, then re-signs *only* the access token so the new value is on its `locale` claim immediately — this tab\'s own requests read the new language right away rather than waiting for the access token to expire and refresh. Deliberately does not touch the refresh token (unlike change-password/set-password): a locale preference is not proof of anything beyond what the caller\'s existing access token already proves, so this must not be usable to mint a fresh 7-day refresh token from one. Another signed-in tab simply keeps its own locale until it next refreshes. Tenant-user tokens only.
   * @summary Set the language responses are rendered in
   * @param {AuthApiAuthControllerUpdateLocaleV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerUpdateLocaleV1(
    requestParameters: AuthApiAuthControllerUpdateLocaleV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<UpdateLocaleResponseDto>;

  /**
   * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a name and password, without spending the token. Same generic 404 for a token that never existed, was already used, or has expired as the platform-admin equivalent.
   * @summary Preview a tenant-member invite
   * @param {AuthApiAuthControllerValidateMemberInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerValidateMemberInviteV1(
    requestParameters: AuthApiAuthControllerValidateMemberInviteV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<MemberInvitePreviewDto>;

  /**
   * Marks the code used, activates the user, and — since reaching this screen already proved the caller knows the account password (either just set at signup or just typed at login) — issues a token pair, same as a successful login. Same INVALID_OR_EXPIRED_OTP error for a code that never existed, was already used, expired, or belongs to an account no longer pending_verification — never distinguished (Security considerations). The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body — only `accessToken` is.
   * @summary Consume a signup/login verification OTP (password path only)
   * @param {AuthApiAuthControllerVerifyEmailV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  authControllerVerifyEmailV1(
    requestParameters: AuthApiAuthControllerVerifyEmailV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TokenResponseDto>;

  /**
   * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below. Tenant-user tokens only.
   * @summary Get a signed avatar upload authorization
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  tenantAvatarControllerAuthorizeV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AvatarUploadAuthorizationResponseDto>;

  /**
   * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this user\'s current avatar — replacing any previous one. Tenant-user tokens only.
   * @summary Confirm an uploaded avatar
   * @param {AuthApiTenantAvatarControllerConfirmAvatarV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  tenantAvatarControllerConfirmAvatarV1(
    requestParameters: AuthApiTenantAvatarControllerConfirmAvatarV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ConfirmAvatarResponseDto>;
}

/**
 * Request parameters for authControllerAcceptMemberInviteV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerAcceptMemberInviteV1Request {
  readonly acceptMemberInviteDto: AcceptMemberInviteDto;
}

/**
 * Request parameters for authControllerChangePasswordV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerChangePasswordV1Request {
  readonly changePasswordDto: ChangePasswordDto;
}

/**
 * Request parameters for authControllerCompleteGoogleSignupV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerCompleteGoogleSignupV1Request {
  readonly completeGoogleSignupDto: CompleteGoogleSignupDto;
}

/**
 * Request parameters for authControllerGoogleAuthorizeV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerGoogleAuthorizeV1Request {
  /**
   * Which button started this. &#x60;signup&#x60; may end in a new tenant; &#x60;login&#x60; never creates one and rejects an unknown identity with &#x60;?error&#x3D;NO_ACCOUNT&#x60;. Neither carries a business name here — see &#x60;POST /v1/auth/google/complete-signup&#x60;, which is where a genuinely new signup supplies one, after Google has already verified the identity. Accepting a platform-admin invite through Google is NOT one of these — that has its own route, &#x60;GET /v1/auth/invite/:token/google&#x60;, which carries the invite token.
   */
  readonly intent: AuthControllerGoogleAuthorizeV1IntentEnum;
}

/**
 * Request parameters for authControllerInviteGoogleAuthorizeV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerInviteGoogleAuthorizeV1Request {
  /**
   * The raw invite token from the accept-invite link
   */
  readonly token: string;
}

/**
 * Request parameters for authControllerLoginV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerLoginV1Request {
  readonly loginDto: LoginDto;
}

/**
 * Request parameters for authControllerResendOtpV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerResendOtpV1Request {
  readonly resendOtpDto: ResendOtpDto;
}

/**
 * Request parameters for authControllerSetPasswordV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerSetPasswordV1Request {
  readonly setPasswordDto: SetPasswordDto;
}

/**
 * Request parameters for authControllerSignupV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerSignupV1Request {
  readonly signupDto: SignupDto;
}

/**
 * Request parameters for authControllerUpdateLocaleV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerUpdateLocaleV1Request {
  readonly updateLocaleDto: UpdateLocaleDto;
}

/**
 * Request parameters for authControllerValidateMemberInviteV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerValidateMemberInviteV1Request {
  /**
   * The raw invite token from the accept-invite link
   */
  readonly token: string;
}

/**
 * Request parameters for authControllerVerifyEmailV1 operation in AuthApi.
 */
export interface AuthApiAuthControllerVerifyEmailV1Request {
  readonly verifyEmailDto: VerifyEmailDto;
}

/**
 * Request parameters for tenantAvatarControllerConfirmAvatarV1 operation in AuthApi.
 */
export interface AuthApiTenantAvatarControllerConfirmAvatarV1Request {
  readonly confirmAvatarDto: ConfirmAvatarDto;
}

/**
 * AuthApi - object-oriented interface
 */
export class AuthApi extends BaseAPI implements AuthApiInterface {
  /**
   * Sets `users.name`/`password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap, so a double-submit cannot redeem the same token twice. Signs the member in on success, same shape as `POST /v1/auth/login`. See `GET /v1/auth/invite/:token/google` for the SSO alternative.
   * @summary Accept a tenant-member invite by setting a name and password
   * @param {AuthApiAuthControllerAcceptMemberInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerAcceptMemberInviteV1(
    requestParameters: AuthApiAuthControllerAcceptMemberInviteV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerAcceptMemberInviteV1(
        requestParameters.acceptMemberInviteDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Requires the current password. Updates `users.password_hash`, revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Other sessions die. Tenant-user tokens only. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
   * @summary Change the current user’s password
   * @param {AuthApiAuthControllerChangePasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerChangePasswordV1(
    requestParameters: AuthApiAuthControllerChangePasswordV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerChangePasswordV1(
        requestParameters.changePasswordDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Only reachable after the callback set a `google_pending_signup` cookie for a genuinely new person — Google returns a person, not a business, and `tenants.name` is NOT NULL. Creates the tenant + owner + settings + default prompts and issues session cookies, same as every other successful auth endpoint (unlike the two Google endpoints above, this is a normal XHR call, not a redirect).
   * @summary Finish a Google signup with a business name
   * @param {AuthApiAuthControllerCompleteGoogleSignupV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerCompleteGoogleSignupV1(
    requestParameters: AuthApiAuthControllerCompleteGoogleSignupV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerCompleteGoogleSignupV1(
        requestParameters.completeGoogleSignupDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Redirects (302) to Google\'s consent screen and sets the `google_auth_sid` cookie that binds the round trip to this browser. Not an XHR endpoint — the SPA navigates here, so the response is a redirect rather than JSON. Carries no business name: a genuinely new signup collects one afterward, at `POST /v1/auth/google/complete-signup`.
   * @summary Start Google sign-in or signup
   * @param {AuthApiAuthControllerGoogleAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerGoogleAuthorizeV1(
    requestParameters: AuthApiAuthControllerGoogleAuthorizeV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerGoogleAuthorizeV1(requestParameters.intent, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Where Google returns the browser. Consumes the one-time state *before* exchanging the code, then resolves the identity: a known `user_identities` row signs in; a matching email links the identity and signs in; neither, under `intent=login`, is `?error=NO_ACCOUNT`; neither, under `intent=signup`, sets a `google_pending_signup` cookie and redirects to /onboarding/business-name to collect the one thing Google cannot supply. Always a 302 — success sets the session cookies, every failure appends `?error=` to /login or /onboarding/signup, because a JSON body would paint as a document here.
   * @summary Google sign-in callback
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerGoogleCallbackV1(options?: RawAxiosRequestConfig) {
    return AuthApiFp(this.configuration)
      .authControllerGoogleCallbackV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The SSO alternative to `POST /v1/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `user_identities` row yet for that callback branch to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
   * @summary Accept a tenant-member invite via Google
   * @param {AuthApiAuthControllerInviteGoogleAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerInviteGoogleAuthorizeV1(
    requestParameters: AuthApiAuthControllerInviteGoogleAuthorizeV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerInviteGoogleAuthorizeV1(requestParameters.token, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Tenant-user login only — platform admins have their own route, `POST /v1/admin/auth/login` (see `separate-admin-login-design.md` for why the two were split apart). A still-`pending_verification` account is not an error here: credentials are checked first, and on success a fresh OTP is sent and a `pending_verification` result is returned instead of tokens — the frontend renders the same OTP stepper the signup wizard uses. `disabled`/`suspended` accounts fail with 403. The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body.
   * @summary Password login
   * @param {AuthApiAuthControllerLoginV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerLoginV1(
    requestParameters: AuthApiAuthControllerLoginV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerLoginV1(requestParameters.loginDto, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * All sessions/devices — a single-session logout is intentionally not offered separately. Also clears the `refresh_token` cookie for the caller.
   * @summary Revoke every refresh token for the current user
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerLogoutV1(options?: RawAxiosRequestConfig) {
    return AuthApiFp(this.configuration)
      .authControllerLogoutV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The authoritative profile for the current access token — name, email, role, the tenant name, and whether a password is set. Settings reads this rather than reassembling it from client-side storage, which could not answer either question for a Google sign-in (a redirect-only flow that never returns a JSON body to the SPA).
   * @summary The signed-in tenant user
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerMeV1(options?: RawAxiosRequestConfig) {
    return AuthApiFp(this.configuration)
      .authControllerMeV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * No request body — the refresh token comes from the httpOnly `refresh_token` cookie (set by login/verify-email/a prior refresh), never from a payload a script could construct. Single-use rotation: the presented refresh token is revoked in the same call a new pair is issued (and the cookie replaced). Re-checks the owning user/tenant standing every time (disabled/suspended revokes every refresh token that user has). Re-presenting an already-spent token is judged by age: within a short grace window it is treated as a lost two-tab race and the session is preserved; older than that, every refresh token for that user is revoked as suspected reuse of a leaked token.
   * @summary Rotate the refresh token, mint a fresh access token
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerRefreshV1(options?: RawAxiosRequestConfig) {
    return AuthApiFp(this.configuration)
      .authControllerRefreshV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Step-up verification ahead of POST /v1/auth/set-password: emails a 6-digit code to the caller\'s own address, proving live mailbox control rather than just possession of an access token. Same cooldown/attempt-budget shape as the signup/login OTP. 400s if the account already has a password.
   * @summary Request the OTP required to set a password on a passwordless account
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerRequestSetPasswordOtpV1(
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerRequestSetPasswordOtpV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The OTP stepper\'s \"Resend\" button — doesn\'t collect a password (unlike login), so it always returns the same generic acknowledgement whether or not the email matches a pending_verification account, same enumeration-prevention shape as forgot-password.
   * @summary Resend a verification OTP
   * @param {AuthApiAuthControllerResendOtpV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerResendOtpV1(
    requestParameters: AuthApiAuthControllerResendOtpV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerResendOtpV1(requestParameters.resendOtpDto, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * For a Google/SSO-only account (`users.password_hash IS NULL`) — no current password to prove, so unlike POST /v1/auth/change-password this takes `otp` (from POST /v1/auth/set-password/request-otp) instead. Revokes every refresh token for the user, then issues a fresh pair so this tab stays signed in. Tenant-user tokens only. 400s if the account already has a password, or if the OTP is missing/expired/wrong — use change-password instead in the former case.
   * @summary Set a password for an account that has never had one
   * @param {AuthApiAuthControllerSetPasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerSetPasswordV1(
    requestParameters: AuthApiAuthControllerSetPasswordV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerSetPasswordV1(requestParameters.setPasswordDto, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Creates the tenant, owner, and default settings together, then emails a 6-digit verification code (no link — see POST /v1/auth/verify-email). Fails with 409 if this email is already registered, under any status or tenant. `businessName` is the tenant/company name — required, and distinct from a `locations.name` (the per-location name synced later from a connected Google Business Profile).
   * @summary Owner self-registration (password path)
   * @param {AuthApiAuthControllerSignupV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerSignupV1(
    requestParameters: AuthApiAuthControllerSignupV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerSignupV1(requestParameters.signupDto, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Persists `users.locale`, then re-signs *only* the access token so the new value is on its `locale` claim immediately — this tab\'s own requests read the new language right away rather than waiting for the access token to expire and refresh. Deliberately does not touch the refresh token (unlike change-password/set-password): a locale preference is not proof of anything beyond what the caller\'s existing access token already proves, so this must not be usable to mint a fresh 7-day refresh token from one. Another signed-in tab simply keeps its own locale until it next refreshes. Tenant-user tokens only.
   * @summary Set the language responses are rendered in
   * @param {AuthApiAuthControllerUpdateLocaleV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerUpdateLocaleV1(
    requestParameters: AuthApiAuthControllerUpdateLocaleV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerUpdateLocaleV1(requestParameters.updateLocaleDto, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a name and password, without spending the token. Same generic 404 for a token that never existed, was already used, or has expired as the platform-admin equivalent.
   * @summary Preview a tenant-member invite
   * @param {AuthApiAuthControllerValidateMemberInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerValidateMemberInviteV1(
    requestParameters: AuthApiAuthControllerValidateMemberInviteV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerValidateMemberInviteV1(requestParameters.token, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Marks the code used, activates the user, and — since reaching this screen already proved the caller knows the account password (either just set at signup or just typed at login) — issues a token pair, same as a successful login. Same INVALID_OR_EXPIRED_OTP error for a code that never existed, was already used, expired, or belongs to an account no longer pending_verification — never distinguished (Security considerations). The refresh token is set as an httpOnly `refresh_token` cookie (scoped to `/v1/auth`), never in the JSON body — only `accessToken` is.
   * @summary Consume a signup/login verification OTP (password path only)
   * @param {AuthApiAuthControllerVerifyEmailV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public authControllerVerifyEmailV1(
    requestParameters: AuthApiAuthControllerVerifyEmailV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .authControllerVerifyEmailV1(requestParameters.verifyEmailDto, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below. Tenant-user tokens only.
   * @summary Get a signed avatar upload authorization
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public tenantAvatarControllerAuthorizeV1(options?: RawAxiosRequestConfig) {
    return AuthApiFp(this.configuration)
      .tenantAvatarControllerAuthorizeV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this user\'s current avatar — replacing any previous one. Tenant-user tokens only.
   * @summary Confirm an uploaded avatar
   * @param {AuthApiTenantAvatarControllerConfirmAvatarV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public tenantAvatarControllerConfirmAvatarV1(
    requestParameters: AuthApiTenantAvatarControllerConfirmAvatarV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AuthApiFp(this.configuration)
      .tenantAvatarControllerConfirmAvatarV1(
        requestParameters.confirmAvatarDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}

export const AuthControllerGoogleAuthorizeV1IntentEnum = {
  Login: 'login',
  Signup: 'signup',
  AdminInvite: 'admin_invite',
  AdminLogin: 'admin_login',
  Invite: 'invite',
} as const;
export type AuthControllerGoogleAuthorizeV1IntentEnum =
  (typeof AuthControllerGoogleAuthorizeV1IntentEnum)[keyof typeof AuthControllerGoogleAuthorizeV1IntentEnum];
