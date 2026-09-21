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
import type { AcceptAdminInviteDto } from '../models';
// @ts-ignore
import type { AdminInvitePreviewDto } from '../models';
// @ts-ignore
import type { LoginDto } from '../models';
/**
 * AdminAuthApi - axios parameter creator
 */
export const AdminAuthApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Sets `platform_admins.password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap (`used_at IS NULL AND expires_at > now()` inside the same UPDATE), so a double-submit cannot redeem the same token twice. Issues an admin session on success, same shape as `POST /v1/admin/auth/login` — only the `admin_access_token` cookie is set. See `GET /v1/admin/auth/invite/:token/google` for the SSO alternative.
     * @summary Accept a platform-admin invite by setting a password
     * @param {AcceptAdminInviteDto} acceptAdminInviteDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerAcceptAdminInviteV1: async (
      acceptAdminInviteDto: AcceptAdminInviteDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'acceptAdminInviteDto' is not null or undefined
      assertParamExists(
        'platformAdminAuthControllerAcceptAdminInviteV1',
        'acceptAdminInviteDto',
        acceptAdminInviteDto,
      );
      const localVarPath = `/v1/admin/auth/invite/accept`;
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
        acceptAdminInviteDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * The Google button on the admin sign-in screen. Its own route and its own `OAuthIntent.ADMIN_LOGIN`, not the tenant `GET /v1/auth/google`: this one resolves the returned identity against `platform_admin_identities` and stops there, so the admin screen can never hand back a tenant session, and every failure lands on `/admin-login?error=` rather than the tenant login page. Needed because an admin who accepted their invite through Google has no password at all — this is their only way back in. Completion happens at the shared `GET /v1/auth/google/callback`.
     * @summary Start a platform-admin Google sign-in
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerGoogleLoginV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/auth/google`;
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
     * The SSO alternative to `POST /v1/admin/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `platform_admin_identities` row yet for that callback to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
     * @summary Accept a platform-admin invite via Google
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerInviteGoogleAuthorizeV1: async (
      token: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'token' is not null or undefined
      assertParamExists(
        'platformAdminAuthControllerInviteGoogleAuthorizeV1',
        'token',
        token,
      );
      const localVarPath = `/v1/admin/auth/invite/{token}/google`.replace(
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
     * Its own route, not the shared tenant `POST /v1/auth/login` — queries `platform_admins` directly, with nothing left to disambiguate (see `separate-admin-login-design.md`). Only the `admin_access_token` cookie is set — see `TokenService.signPlatformAdminAccessToken` for why this principal type has no refresh token.
     * @summary Platform-admin password login
     * @param {LoginDto} loginDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerLoginV1: async (
      loginDto: LoginDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'loginDto' is not null or undefined
      assertParamExists(
        'platformAdminAuthControllerLoginV1',
        'loginDto',
        loginDto,
      );
      const localVarPath = `/v1/admin/auth/login`;
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
     * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a password, without spending the token — read-only, does not set `used_at`. Same check `POST /v1/admin/auth/invite/accept` and the Google authorize route below apply: `purpose = \'invite\'`, unused, unexpired.
     * @summary Preview a platform-admin invite
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerValidateAdminInviteV1: async (
      token: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'token' is not null or undefined
      assertParamExists(
        'platformAdminAuthControllerValidateAdminInviteV1',
        'token',
        token,
      );
      const localVarPath = `/v1/admin/auth/invite/{token}`.replace(
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
  };
};

/**
 * AdminAuthApi - functional programming interface
 */
export const AdminAuthApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminAuthApiAxiosParamCreator(configuration);
  return {
    /**
     * Sets `platform_admins.password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap (`used_at IS NULL AND expires_at > now()` inside the same UPDATE), so a double-submit cannot redeem the same token twice. Issues an admin session on success, same shape as `POST /v1/admin/auth/login` — only the `admin_access_token` cookie is set. See `GET /v1/admin/auth/invite/:token/google` for the SSO alternative.
     * @summary Accept a platform-admin invite by setting a password
     * @param {AcceptAdminInviteDto} acceptAdminInviteDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async platformAdminAuthControllerAcceptAdminInviteV1(
      acceptAdminInviteDto: AcceptAdminInviteDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.platformAdminAuthControllerAcceptAdminInviteV1(
          acceptAdminInviteDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminAuthApi.platformAdminAuthControllerAcceptAdminInviteV1'
        ]?.[localVarOperationServerIndex]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * The Google button on the admin sign-in screen. Its own route and its own `OAuthIntent.ADMIN_LOGIN`, not the tenant `GET /v1/auth/google`: this one resolves the returned identity against `platform_admin_identities` and stops there, so the admin screen can never hand back a tenant session, and every failure lands on `/admin-login?error=` rather than the tenant login page. Needed because an admin who accepted their invite through Google has no password at all — this is their only way back in. Completion happens at the shared `GET /v1/auth/google/callback`.
     * @summary Start a platform-admin Google sign-in
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async platformAdminAuthControllerGoogleLoginV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.platformAdminAuthControllerGoogleLoginV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminAuthApi.platformAdminAuthControllerGoogleLoginV1'
        ]?.[localVarOperationServerIndex]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * The SSO alternative to `POST /v1/admin/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `platform_admin_identities` row yet for that callback to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
     * @summary Accept a platform-admin invite via Google
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async platformAdminAuthControllerInviteGoogleAuthorizeV1(
      token: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.platformAdminAuthControllerInviteGoogleAuthorizeV1(
          token,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminAuthApi.platformAdminAuthControllerInviteGoogleAuthorizeV1'
        ]?.[localVarOperationServerIndex]?.url;
      return (axios, basePath) =>
        createRequestFunction(
          localVarAxiosArgs,
          globalAxios,
          BASE_PATH,
          configuration,
        )(axios, localVarOperationServerBasePath || basePath);
    },
    /**
     * Its own route, not the shared tenant `POST /v1/auth/login` — queries `platform_admins` directly, with nothing left to disambiguate (see `separate-admin-login-design.md`). Only the `admin_access_token` cookie is set — see `TokenService.signPlatformAdminAccessToken` for why this principal type has no refresh token.
     * @summary Platform-admin password login
     * @param {LoginDto} loginDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async platformAdminAuthControllerLoginV1(
      loginDto: LoginDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.platformAdminAuthControllerLoginV1(
          loginDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AdminAuthApi.platformAdminAuthControllerLoginV1']?.[
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
     * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a password, without spending the token — read-only, does not set `used_at`. Same check `POST /v1/admin/auth/invite/accept` and the Google authorize route below apply: `purpose = \'invite\'`, unused, unexpired.
     * @summary Preview a platform-admin invite
     * @param {string} token The raw invite token from the accept-invite link
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async platformAdminAuthControllerValidateAdminInviteV1(
      token: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminInvitePreviewDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.platformAdminAuthControllerValidateAdminInviteV1(
          token,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminAuthApi.platformAdminAuthControllerValidateAdminInviteV1'
        ]?.[localVarOperationServerIndex]?.url;
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
 * AdminAuthApi - factory interface
 */
export const AdminAuthApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AdminAuthApiFp(configuration);
  return {
    /**
     * Sets `platform_admins.password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap (`used_at IS NULL AND expires_at > now()` inside the same UPDATE), so a double-submit cannot redeem the same token twice. Issues an admin session on success, same shape as `POST /v1/admin/auth/login` — only the `admin_access_token` cookie is set. See `GET /v1/admin/auth/invite/:token/google` for the SSO alternative.
     * @summary Accept a platform-admin invite by setting a password
     * @param {AdminAuthApiPlatformAdminAuthControllerAcceptAdminInviteV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerAcceptAdminInviteV1(
      requestParameters: AdminAuthApiPlatformAdminAuthControllerAcceptAdminInviteV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .platformAdminAuthControllerAcceptAdminInviteV1(
          requestParameters.acceptAdminInviteDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * The Google button on the admin sign-in screen. Its own route and its own `OAuthIntent.ADMIN_LOGIN`, not the tenant `GET /v1/auth/google`: this one resolves the returned identity against `platform_admin_identities` and stops there, so the admin screen can never hand back a tenant session, and every failure lands on `/admin-login?error=` rather than the tenant login page. Needed because an admin who accepted their invite through Google has no password at all — this is their only way back in. Completion happens at the shared `GET /v1/auth/google/callback`.
     * @summary Start a platform-admin Google sign-in
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerGoogleLoginV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .platformAdminAuthControllerGoogleLoginV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The SSO alternative to `POST /v1/admin/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `platform_admin_identities` row yet for that callback to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
     * @summary Accept a platform-admin invite via Google
     * @param {AdminAuthApiPlatformAdminAuthControllerInviteGoogleAuthorizeV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerInviteGoogleAuthorizeV1(
      requestParameters: AdminAuthApiPlatformAdminAuthControllerInviteGoogleAuthorizeV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .platformAdminAuthControllerInviteGoogleAuthorizeV1(
          requestParameters.token,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Its own route, not the shared tenant `POST /v1/auth/login` — queries `platform_admins` directly, with nothing left to disambiguate (see `separate-admin-login-design.md`). Only the `admin_access_token` cookie is set — see `TokenService.signPlatformAdminAccessToken` for why this principal type has no refresh token.
     * @summary Platform-admin password login
     * @param {AdminAuthApiPlatformAdminAuthControllerLoginV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerLoginV1(
      requestParameters: AdminAuthApiPlatformAdminAuthControllerLoginV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .platformAdminAuthControllerLoginV1(requestParameters.loginDto, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a password, without spending the token — read-only, does not set `used_at`. Same check `POST /v1/admin/auth/invite/accept` and the Google authorize route below apply: `purpose = \'invite\'`, unused, unexpired.
     * @summary Preview a platform-admin invite
     * @param {AdminAuthApiPlatformAdminAuthControllerValidateAdminInviteV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformAdminAuthControllerValidateAdminInviteV1(
      requestParameters: AdminAuthApiPlatformAdminAuthControllerValidateAdminInviteV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminInvitePreviewDto> {
      return localVarFp
        .platformAdminAuthControllerValidateAdminInviteV1(
          requestParameters.token,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminAuthApi - interface
 */
export interface AdminAuthApiInterface {
  /**
   * Sets `platform_admins.password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap (`used_at IS NULL AND expires_at > now()` inside the same UPDATE), so a double-submit cannot redeem the same token twice. Issues an admin session on success, same shape as `POST /v1/admin/auth/login` — only the `admin_access_token` cookie is set. See `GET /v1/admin/auth/invite/:token/google` for the SSO alternative.
   * @summary Accept a platform-admin invite by setting a password
   * @param {AdminAuthApiPlatformAdminAuthControllerAcceptAdminInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  platformAdminAuthControllerAcceptAdminInviteV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerAcceptAdminInviteV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * The Google button on the admin sign-in screen. Its own route and its own `OAuthIntent.ADMIN_LOGIN`, not the tenant `GET /v1/auth/google`: this one resolves the returned identity against `platform_admin_identities` and stops there, so the admin screen can never hand back a tenant session, and every failure lands on `/admin-login?error=` rather than the tenant login page. Needed because an admin who accepted their invite through Google has no password at all — this is their only way back in. Completion happens at the shared `GET /v1/auth/google/callback`.
   * @summary Start a platform-admin Google sign-in
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  platformAdminAuthControllerGoogleLoginV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * The SSO alternative to `POST /v1/admin/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `platform_admin_identities` row yet for that callback to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
   * @summary Accept a platform-admin invite via Google
   * @param {AdminAuthApiPlatformAdminAuthControllerInviteGoogleAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  platformAdminAuthControllerInviteGoogleAuthorizeV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerInviteGoogleAuthorizeV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Its own route, not the shared tenant `POST /v1/auth/login` — queries `platform_admins` directly, with nothing left to disambiguate (see `separate-admin-login-design.md`). Only the `admin_access_token` cookie is set — see `TokenService.signPlatformAdminAccessToken` for why this principal type has no refresh token.
   * @summary Platform-admin password login
   * @param {AdminAuthApiPlatformAdminAuthControllerLoginV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  platformAdminAuthControllerLoginV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerLoginV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a password, without spending the token — read-only, does not set `used_at`. Same check `POST /v1/admin/auth/invite/accept` and the Google authorize route below apply: `purpose = \'invite\'`, unused, unexpired.
   * @summary Preview a platform-admin invite
   * @param {AdminAuthApiPlatformAdminAuthControllerValidateAdminInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  platformAdminAuthControllerValidateAdminInviteV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerValidateAdminInviteV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminInvitePreviewDto>;
}

/**
 * Request parameters for platformAdminAuthControllerAcceptAdminInviteV1 operation in AdminAuthApi.
 */
export interface AdminAuthApiPlatformAdminAuthControllerAcceptAdminInviteV1Request {
  readonly acceptAdminInviteDto: AcceptAdminInviteDto;
}

/**
 * Request parameters for platformAdminAuthControllerInviteGoogleAuthorizeV1 operation in AdminAuthApi.
 */
export interface AdminAuthApiPlatformAdminAuthControllerInviteGoogleAuthorizeV1Request {
  /**
   * The raw invite token from the accept-invite link
   */
  readonly token: string;
}

/**
 * Request parameters for platformAdminAuthControllerLoginV1 operation in AdminAuthApi.
 */
export interface AdminAuthApiPlatformAdminAuthControllerLoginV1Request {
  readonly loginDto: LoginDto;
}

/**
 * Request parameters for platformAdminAuthControllerValidateAdminInviteV1 operation in AdminAuthApi.
 */
export interface AdminAuthApiPlatformAdminAuthControllerValidateAdminInviteV1Request {
  /**
   * The raw invite token from the accept-invite link
   */
  readonly token: string;
}

/**
 * AdminAuthApi - object-oriented interface
 */
export class AdminAuthApi extends BaseAPI implements AdminAuthApiInterface {
  /**
   * Sets `platform_admins.password_hash`, flips `status` `invited` -> `active`, and consumes the invite token — a guarded compare-and-swap (`used_at IS NULL AND expires_at > now()` inside the same UPDATE), so a double-submit cannot redeem the same token twice. Issues an admin session on success, same shape as `POST /v1/admin/auth/login` — only the `admin_access_token` cookie is set. See `GET /v1/admin/auth/invite/:token/google` for the SSO alternative.
   * @summary Accept a platform-admin invite by setting a password
   * @param {AdminAuthApiPlatformAdminAuthControllerAcceptAdminInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public platformAdminAuthControllerAcceptAdminInviteV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerAcceptAdminInviteV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminAuthApiFp(this.configuration)
      .platformAdminAuthControllerAcceptAdminInviteV1(
        requestParameters.acceptAdminInviteDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The Google button on the admin sign-in screen. Its own route and its own `OAuthIntent.ADMIN_LOGIN`, not the tenant `GET /v1/auth/google`: this one resolves the returned identity against `platform_admin_identities` and stops there, so the admin screen can never hand back a tenant session, and every failure lands on `/admin-login?error=` rather than the tenant login page. Needed because an admin who accepted their invite through Google has no password at all — this is their only way back in. Completion happens at the shared `GET /v1/auth/google/callback`.
   * @summary Start a platform-admin Google sign-in
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public platformAdminAuthControllerGoogleLoginV1(
    options?: RawAxiosRequestConfig,
  ) {
    return AdminAuthApiFp(this.configuration)
      .platformAdminAuthControllerGoogleLoginV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The SSO alternative to `POST /v1/admin/auth/invite/accept` — deliberately not the same route as `GET /v1/auth/google` login, since a first-time invitee has no `platform_admin_identities` row yet for that callback to find. Re-validates the token (unexpired, unused) before ever redirecting, so a dead link fails fast on this screen rather than after the round trip. Completion happens back at the shared `GET /v1/auth/google/callback`: the IdP-verified email must exactly match the invited address (`?error=INVITE_EMAIL_MISMATCH` otherwise, token left unconsumed) — the check that stops someone else\'s Google account from redeeming this link.
   * @summary Accept a platform-admin invite via Google
   * @param {AdminAuthApiPlatformAdminAuthControllerInviteGoogleAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public platformAdminAuthControllerInviteGoogleAuthorizeV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerInviteGoogleAuthorizeV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminAuthApiFp(this.configuration)
      .platformAdminAuthControllerInviteGoogleAuthorizeV1(
        requestParameters.token,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Its own route, not the shared tenant `POST /v1/auth/login` — queries `platform_admins` directly, with nothing left to disambiguate (see `separate-admin-login-design.md`). Only the `admin_access_token` cookie is set — see `TokenService.signPlatformAdminAccessToken` for why this principal type has no refresh token.
   * @summary Platform-admin password login
   * @param {AdminAuthApiPlatformAdminAuthControllerLoginV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public platformAdminAuthControllerLoginV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerLoginV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminAuthApiFp(this.configuration)
      .platformAdminAuthControllerLoginV1(requestParameters.loginDto, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Lets the accept screen show \"You\'ve been invited as `<email>`\" before asking for a password, without spending the token — read-only, does not set `used_at`. Same check `POST /v1/admin/auth/invite/accept` and the Google authorize route below apply: `purpose = \'invite\'`, unused, unexpired.
   * @summary Preview a platform-admin invite
   * @param {AdminAuthApiPlatformAdminAuthControllerValidateAdminInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public platformAdminAuthControllerValidateAdminInviteV1(
    requestParameters: AdminAuthApiPlatformAdminAuthControllerValidateAdminInviteV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminAuthApiFp(this.configuration)
      .platformAdminAuthControllerValidateAdminInviteV1(
        requestParameters.token,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
