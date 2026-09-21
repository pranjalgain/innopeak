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
import type { AdminInviteResponseDto } from '../models';
// @ts-ignore
import type { AdminProfileResponseDto } from '../models';
// @ts-ignore
import type { AvatarUploadAuthorizationResponseDto } from '../models';
// @ts-ignore
import type { ChangeAdminPasswordDto } from '../models';
// @ts-ignore
import type { ConfirmAvatarDto } from '../models';
// @ts-ignore
import type { ConfirmAvatarResponseDto } from '../models';
// @ts-ignore
import type { PlatformSettingsResponseDto } from '../models';
// @ts-ignore
import type { SendAdminInviteDto } from '../models';
// @ts-ignore
import type { SetAdminPasswordDto } from '../models';
// @ts-ignore
import type { SetAdminStatusDto } from '../models';
// @ts-ignore
import type { UpdateAdminLocaleResponseDto } from '../models';
// @ts-ignore
import type { UpdateLocaleDto } from '../models';
// @ts-ignore
import type { UpdatePlatformSettingsDto } from '../models';
/**
 * AdminSettingsApi - axios parameter creator
 */
export const AdminSettingsApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below.
     * @summary Get a signed avatar upload authorization
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminAvatarControllerAuthorizeV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/settings/profile/avatar/authorize`;
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
     * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this admin\'s current avatar — replacing any previous one.
     * @summary Confirm an uploaded avatar
     * @param {ConfirmAvatarDto} confirmAvatarDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminAvatarControllerConfirmAvatarV1: async (
      confirmAvatarDto: ConfirmAvatarDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'confirmAvatarDto' is not null or undefined
      assertParamExists(
        'adminAvatarControllerConfirmAvatarV1',
        'confirmAvatarDto',
        confirmAvatarDto,
      );
      const localVarPath = `/v1/admin/settings/profile/avatar/confirm`;
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
    /**
     * No session to revoke afterward — a platform admin has no refresh-token concept yet, so there is nothing else to rotate on a successful change.
     * @summary Change the signed-in platform admin\'s own password
     * @param {ChangeAdminPasswordDto} changeAdminPasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerChangePasswordV1: async (
      changeAdminPasswordDto: ChangeAdminPasswordDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'changeAdminPasswordDto' is not null or undefined
      assertParamExists(
        'adminSettingsControllerChangePasswordV1',
        'changeAdminPasswordDto',
        changeAdminPasswordDto,
      );
      const localVarPath = `/v1/admin/settings/profile/change-password`;
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
        changeAdminPasswordDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     *
     * @summary Get the signed-in platform admin\'s own profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerGetProfileV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/settings/profile`;
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
     * Despite the name, this is the full admin roster (matching the frontend\'s PlatformAdminInvite[] shape), not only pending invites — each row also carries its own invite metadata where one exists.
     * @summary List every platform admin, including the seeded root
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerListInvitesV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/settings/invites`;
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
     * Only for an admin with no password yet (accepted their invite via Google, or was seeded before this flow existed). Mailed to the account\'s own address — proof the caller still controls that mailbox, since an access token alone is not enough to grant a passwordless account a permanent credential.
     * @summary Request the OTP required to add a first password
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerRequestSetPasswordOtpV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/settings/profile/set-password/request-otp`;
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
     * Deletes the invited admin\'s row outright — only while it is still `invited`. An admin who has already accepted or been disabled cannot be revoked through this route.
     * @summary Revoke a pending invite
     * @param {string} inviteId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerRevokeInviteV1: async (
      inviteId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'inviteId' is not null or undefined
      assertParamExists(
        'adminSettingsControllerRevokeInviteV1',
        'inviteId',
        inviteId,
      );
      const localVarPath = `/v1/admin/settings/invites/{inviteId}`.replace(
        '{inviteId}',
        encodeURIComponent(String(inviteId)),
      );
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'DELETE',
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
     * Creates the invited admin\'s own row (status \"invited\", no password) and a 7-day invite token record. Does **not** email the invite or expose an accept-invite endpoint yet — that pairing is separate, comparably-sized follow-up work.
     * @summary Invite a new platform admin
     * @param {SendAdminInviteDto} sendAdminInviteDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerSendInviteV1: async (
      sendAdminInviteDto: SendAdminInviteDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'sendAdminInviteDto' is not null or undefined
      assertParamExists(
        'adminSettingsControllerSendInviteV1',
        'sendAdminInviteDto',
        sendAdminInviteDto,
      );
      const localVarPath = `/v1/admin/settings/invites`;
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
        sendAdminInviteDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Sets another admin `active`/`disabled`. Combined with the per-request status check in JwtStrategy, a disable ends the target admin’s access on their next request. Cannot target yourself, an invited (not-yet-accepted) admin, or the last active admin.
     * @summary Disable or re-enable a platform admin
     * @param {string} adminId
     * @param {SetAdminStatusDto} setAdminStatusDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerSetAdminStatusV1: async (
      adminId: string,
      setAdminStatusDto: SetAdminStatusDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'adminId' is not null or undefined
      assertParamExists(
        'adminSettingsControllerSetAdminStatusV1',
        'adminId',
        adminId,
      );
      // verify required parameter 'setAdminStatusDto' is not null or undefined
      assertParamExists(
        'adminSettingsControllerSetAdminStatusV1',
        'setAdminStatusDto',
        setAdminStatusDto,
      );
      const localVarPath = `/v1/admin/settings/admins/{adminId}/status`.replace(
        '{adminId}',
        encodeURIComponent(String(adminId)),
      );
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'PATCH',
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
        setAdminStatusDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Requires the OTP from `POST .../set-password/request-otp`. No token to reissue afterward — a platform admin has no refresh token, so there is nothing else to rotate.
     * @summary Set the signed-in platform admin\'s first password
     * @param {SetAdminPasswordDto} setAdminPasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerSetPasswordV1: async (
      setAdminPasswordDto: SetAdminPasswordDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'setAdminPasswordDto' is not null or undefined
      assertParamExists(
        'adminSettingsControllerSetPasswordV1',
        'setAdminPasswordDto',
        setAdminPasswordDto,
      );
      const localVarPath = `/v1/admin/settings/profile/set-password`;
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
        setAdminPasswordDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Persists `platform_admins.locale`, then re-signs the access token (no refresh token to touch — a platform admin has none) so the new value is on its `locale` claim right away rather than waiting for the next login. Platform-admin tokens only.
     * @summary Set the language responses are rendered in
     * @param {UpdateLocaleDto} updateLocaleDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerUpdateLocaleV1: async (
      updateLocaleDto: UpdateLocaleDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'updateLocaleDto' is not null or undefined
      assertParamExists(
        'adminSettingsControllerUpdateLocaleV1',
        'updateLocaleDto',
        updateLocaleDto,
      );
      const localVarPath = `/v1/admin/settings/profile/locale`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'PATCH',
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
     * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false, and one that would turn socialLoginEnabled off while a platform admin has Google as their only credential (an admin who accepted their invite through Google has no password, and there is no admin set-password flow to add one) — see the 400 response. Otherwise does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
     * @summary Update platform-wide feature settings
     * @param {UpdatePlatformSettingsDto} updatePlatformSettingsDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerUpdatePlatformSettingsV1: async (
      updatePlatformSettingsDto: UpdatePlatformSettingsDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'updatePlatformSettingsDto' is not null or undefined
      assertParamExists(
        'adminSettingsControllerUpdatePlatformSettingsV1',
        'updatePlatformSettingsDto',
        updatePlatformSettingsDto,
      );
      const localVarPath = `/v1/admin/settings/platform-config`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'PATCH',
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
        updatePlatformSettingsDto,
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
 * AdminSettingsApi - functional programming interface
 */
export const AdminSettingsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminSettingsApiAxiosParamCreator(configuration);
  return {
    /**
     * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below.
     * @summary Get a signed avatar upload authorization
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminAvatarControllerAuthorizeV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AvatarUploadAuthorizationResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminAvatarControllerAuthorizeV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminAvatarControllerAuthorizeV1'
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
     * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this admin\'s current avatar — replacing any previous one.
     * @summary Confirm an uploaded avatar
     * @param {ConfirmAvatarDto} confirmAvatarDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminAvatarControllerConfirmAvatarV1(
      confirmAvatarDto: ConfirmAvatarDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ConfirmAvatarResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminAvatarControllerConfirmAvatarV1(
          confirmAvatarDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminAvatarControllerConfirmAvatarV1'
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
     * No session to revoke afterward — a platform admin has no refresh-token concept yet, so there is nothing else to rotate on a successful change.
     * @summary Change the signed-in platform admin\'s own password
     * @param {ChangeAdminPasswordDto} changeAdminPasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerChangePasswordV1(
      changeAdminPasswordDto: ChangeAdminPasswordDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerChangePasswordV1(
          changeAdminPasswordDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerChangePasswordV1'
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
     *
     * @summary Get the signed-in platform admin\'s own profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerGetProfileV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminProfileResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerGetProfileV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerGetProfileV1'
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
     * Despite the name, this is the full admin roster (matching the frontend\'s PlatformAdminInvite[] shape), not only pending invites — each row also carries its own invite metadata where one exists.
     * @summary List every platform admin, including the seeded root
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerListInvitesV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<AdminInviteResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerListInvitesV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerListInvitesV1'
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
     * Only for an admin with no password yet (accepted their invite via Google, or was seeded before this flow existed). Mailed to the account\'s own address — proof the caller still controls that mailbox, since an access token alone is not enough to grant a passwordless account a permanent credential.
     * @summary Request the OTP required to add a first password
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerRequestSetPasswordOtpV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerRequestSetPasswordOtpV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerRequestSetPasswordOtpV1'
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
     * Deletes the invited admin\'s row outright — only while it is still `invited`. An admin who has already accepted or been disabled cannot be revoked through this route.
     * @summary Revoke a pending invite
     * @param {string} inviteId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerRevokeInviteV1(
      inviteId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerRevokeInviteV1(
          inviteId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerRevokeInviteV1'
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
     * Creates the invited admin\'s own row (status \"invited\", no password) and a 7-day invite token record. Does **not** email the invite or expose an accept-invite endpoint yet — that pairing is separate, comparably-sized follow-up work.
     * @summary Invite a new platform admin
     * @param {SendAdminInviteDto} sendAdminInviteDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerSendInviteV1(
      sendAdminInviteDto: SendAdminInviteDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminInviteResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerSendInviteV1(
          sendAdminInviteDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerSendInviteV1'
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
     * Sets another admin `active`/`disabled`. Combined with the per-request status check in JwtStrategy, a disable ends the target admin’s access on their next request. Cannot target yourself, an invited (not-yet-accepted) admin, or the last active admin.
     * @summary Disable or re-enable a platform admin
     * @param {string} adminId
     * @param {SetAdminStatusDto} setAdminStatusDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerSetAdminStatusV1(
      adminId: string,
      setAdminStatusDto: SetAdminStatusDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminInviteResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerSetAdminStatusV1(
          adminId,
          setAdminStatusDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerSetAdminStatusV1'
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
     * Requires the OTP from `POST .../set-password/request-otp`. No token to reissue afterward — a platform admin has no refresh token, so there is nothing else to rotate.
     * @summary Set the signed-in platform admin\'s first password
     * @param {SetAdminPasswordDto} setAdminPasswordDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerSetPasswordV1(
      setAdminPasswordDto: SetAdminPasswordDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerSetPasswordV1(
          setAdminPasswordDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerSetPasswordV1'
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
     * Persists `platform_admins.locale`, then re-signs the access token (no refresh token to touch — a platform admin has none) so the new value is on its `locale` claim right away rather than waiting for the next login. Platform-admin tokens only.
     * @summary Set the language responses are rendered in
     * @param {UpdateLocaleDto} updateLocaleDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerUpdateLocaleV1(
      updateLocaleDto: UpdateLocaleDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<UpdateAdminLocaleResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerUpdateLocaleV1(
          updateLocaleDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerUpdateLocaleV1'
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
     * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false, and one that would turn socialLoginEnabled off while a platform admin has Google as their only credential (an admin who accepted their invite through Google has no password, and there is no admin set-password flow to add one) — see the 400 response. Otherwise does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
     * @summary Update platform-wide feature settings
     * @param {UpdatePlatformSettingsDto} updatePlatformSettingsDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerUpdatePlatformSettingsV1(
      updatePlatformSettingsDto: UpdatePlatformSettingsDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<PlatformSettingsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerUpdatePlatformSettingsV1(
          updatePlatformSettingsDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerUpdatePlatformSettingsV1'
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
 * AdminSettingsApi - factory interface
 */
export const AdminSettingsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AdminSettingsApiFp(configuration);
  return {
    /**
     * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below.
     * @summary Get a signed avatar upload authorization
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminAvatarControllerAuthorizeV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AvatarUploadAuthorizationResponseDto> {
      return localVarFp
        .adminAvatarControllerAuthorizeV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this admin\'s current avatar — replacing any previous one.
     * @summary Confirm an uploaded avatar
     * @param {AdminSettingsApiAdminAvatarControllerConfirmAvatarV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminAvatarControllerConfirmAvatarV1(
      requestParameters: AdminSettingsApiAdminAvatarControllerConfirmAvatarV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ConfirmAvatarResponseDto> {
      return localVarFp
        .adminAvatarControllerConfirmAvatarV1(
          requestParameters.confirmAvatarDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * No session to revoke afterward — a platform admin has no refresh-token concept yet, so there is nothing else to rotate on a successful change.
     * @summary Change the signed-in platform admin\'s own password
     * @param {AdminSettingsApiAdminSettingsControllerChangePasswordV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerChangePasswordV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerChangePasswordV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .adminSettingsControllerChangePasswordV1(
          requestParameters.changeAdminPasswordDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     *
     * @summary Get the signed-in platform admin\'s own profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerGetProfileV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminProfileResponseDto> {
      return localVarFp
        .adminSettingsControllerGetProfileV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Despite the name, this is the full admin roster (matching the frontend\'s PlatformAdminInvite[] shape), not only pending invites — each row also carries its own invite metadata where one exists.
     * @summary List every platform admin, including the seeded root
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerListInvitesV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<AdminInviteResponseDto>> {
      return localVarFp
        .adminSettingsControllerListInvitesV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Only for an admin with no password yet (accepted their invite via Google, or was seeded before this flow existed). Mailed to the account\'s own address — proof the caller still controls that mailbox, since an access token alone is not enough to grant a passwordless account a permanent credential.
     * @summary Request the OTP required to add a first password
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerRequestSetPasswordOtpV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .adminSettingsControllerRequestSetPasswordOtpV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Deletes the invited admin\'s row outright — only while it is still `invited`. An admin who has already accepted or been disabled cannot be revoked through this route.
     * @summary Revoke a pending invite
     * @param {AdminSettingsApiAdminSettingsControllerRevokeInviteV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerRevokeInviteV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerRevokeInviteV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .adminSettingsControllerRevokeInviteV1(
          requestParameters.inviteId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Creates the invited admin\'s own row (status \"invited\", no password) and a 7-day invite token record. Does **not** email the invite or expose an accept-invite endpoint yet — that pairing is separate, comparably-sized follow-up work.
     * @summary Invite a new platform admin
     * @param {AdminSettingsApiAdminSettingsControllerSendInviteV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerSendInviteV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerSendInviteV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminInviteResponseDto> {
      return localVarFp
        .adminSettingsControllerSendInviteV1(
          requestParameters.sendAdminInviteDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Sets another admin `active`/`disabled`. Combined with the per-request status check in JwtStrategy, a disable ends the target admin’s access on their next request. Cannot target yourself, an invited (not-yet-accepted) admin, or the last active admin.
     * @summary Disable or re-enable a platform admin
     * @param {AdminSettingsApiAdminSettingsControllerSetAdminStatusV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerSetAdminStatusV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerSetAdminStatusV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminInviteResponseDto> {
      return localVarFp
        .adminSettingsControllerSetAdminStatusV1(
          requestParameters.adminId,
          requestParameters.setAdminStatusDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Requires the OTP from `POST .../set-password/request-otp`. No token to reissue afterward — a platform admin has no refresh token, so there is nothing else to rotate.
     * @summary Set the signed-in platform admin\'s first password
     * @param {AdminSettingsApiAdminSettingsControllerSetPasswordV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerSetPasswordV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerSetPasswordV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .adminSettingsControllerSetPasswordV1(
          requestParameters.setAdminPasswordDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Persists `platform_admins.locale`, then re-signs the access token (no refresh token to touch — a platform admin has none) so the new value is on its `locale` claim right away rather than waiting for the next login. Platform-admin tokens only.
     * @summary Set the language responses are rendered in
     * @param {AdminSettingsApiAdminSettingsControllerUpdateLocaleV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerUpdateLocaleV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerUpdateLocaleV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<UpdateAdminLocaleResponseDto> {
      return localVarFp
        .adminSettingsControllerUpdateLocaleV1(
          requestParameters.updateLocaleDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false, and one that would turn socialLoginEnabled off while a platform admin has Google as their only credential (an admin who accepted their invite through Google has no password, and there is no admin set-password flow to add one) — see the 400 response. Otherwise does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
     * @summary Update platform-wide feature settings
     * @param {AdminSettingsApiAdminSettingsControllerUpdatePlatformSettingsV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerUpdatePlatformSettingsV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerUpdatePlatformSettingsV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<PlatformSettingsResponseDto> {
      return localVarFp
        .adminSettingsControllerUpdatePlatformSettingsV1(
          requestParameters.updatePlatformSettingsDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminSettingsApi - interface
 */
export interface AdminSettingsApiInterface {
  /**
   * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below.
   * @summary Get a signed avatar upload authorization
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminAvatarControllerAuthorizeV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AvatarUploadAuthorizationResponseDto>;

  /**
   * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this admin\'s current avatar — replacing any previous one.
   * @summary Confirm an uploaded avatar
   * @param {AdminSettingsApiAdminAvatarControllerConfirmAvatarV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminAvatarControllerConfirmAvatarV1(
    requestParameters: AdminSettingsApiAdminAvatarControllerConfirmAvatarV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ConfirmAvatarResponseDto>;

  /**
   * No session to revoke afterward — a platform admin has no refresh-token concept yet, so there is nothing else to rotate on a successful change.
   * @summary Change the signed-in platform admin\'s own password
   * @param {AdminSettingsApiAdminSettingsControllerChangePasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerChangePasswordV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerChangePasswordV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   *
   * @summary Get the signed-in platform admin\'s own profile
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerGetProfileV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminProfileResponseDto>;

  /**
   * Despite the name, this is the full admin roster (matching the frontend\'s PlatformAdminInvite[] shape), not only pending invites — each row also carries its own invite metadata where one exists.
   * @summary List every platform admin, including the seeded root
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerListInvitesV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<AdminInviteResponseDto>>;

  /**
   * Only for an admin with no password yet (accepted their invite via Google, or was seeded before this flow existed). Mailed to the account\'s own address — proof the caller still controls that mailbox, since an access token alone is not enough to grant a passwordless account a permanent credential.
   * @summary Request the OTP required to add a first password
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerRequestSetPasswordOtpV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Deletes the invited admin\'s row outright — only while it is still `invited`. An admin who has already accepted or been disabled cannot be revoked through this route.
   * @summary Revoke a pending invite
   * @param {AdminSettingsApiAdminSettingsControllerRevokeInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerRevokeInviteV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerRevokeInviteV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Creates the invited admin\'s own row (status \"invited\", no password) and a 7-day invite token record. Does **not** email the invite or expose an accept-invite endpoint yet — that pairing is separate, comparably-sized follow-up work.
   * @summary Invite a new platform admin
   * @param {AdminSettingsApiAdminSettingsControllerSendInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerSendInviteV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerSendInviteV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminInviteResponseDto>;

  /**
   * Sets another admin `active`/`disabled`. Combined with the per-request status check in JwtStrategy, a disable ends the target admin’s access on their next request. Cannot target yourself, an invited (not-yet-accepted) admin, or the last active admin.
   * @summary Disable or re-enable a platform admin
   * @param {AdminSettingsApiAdminSettingsControllerSetAdminStatusV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerSetAdminStatusV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerSetAdminStatusV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminInviteResponseDto>;

  /**
   * Requires the OTP from `POST .../set-password/request-otp`. No token to reissue afterward — a platform admin has no refresh token, so there is nothing else to rotate.
   * @summary Set the signed-in platform admin\'s first password
   * @param {AdminSettingsApiAdminSettingsControllerSetPasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerSetPasswordV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerSetPasswordV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Persists `platform_admins.locale`, then re-signs the access token (no refresh token to touch — a platform admin has none) so the new value is on its `locale` claim right away rather than waiting for the next login. Platform-admin tokens only.
   * @summary Set the language responses are rendered in
   * @param {AdminSettingsApiAdminSettingsControllerUpdateLocaleV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerUpdateLocaleV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerUpdateLocaleV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<UpdateAdminLocaleResponseDto>;

  /**
   * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false, and one that would turn socialLoginEnabled off while a platform admin has Google as their only credential (an admin who accepted their invite through Google has no password, and there is no admin set-password flow to add one) — see the 400 response. Otherwise does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
   * @summary Update platform-wide feature settings
   * @param {AdminSettingsApiAdminSettingsControllerUpdatePlatformSettingsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerUpdatePlatformSettingsV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerUpdatePlatformSettingsV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<PlatformSettingsResponseDto>;
}

/**
 * Request parameters for adminAvatarControllerConfirmAvatarV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminAvatarControllerConfirmAvatarV1Request {
  readonly confirmAvatarDto: ConfirmAvatarDto;
}

/**
 * Request parameters for adminSettingsControllerChangePasswordV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerChangePasswordV1Request {
  readonly changeAdminPasswordDto: ChangeAdminPasswordDto;
}

/**
 * Request parameters for adminSettingsControllerRevokeInviteV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerRevokeInviteV1Request {
  readonly inviteId: string;
}

/**
 * Request parameters for adminSettingsControllerSendInviteV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerSendInviteV1Request {
  readonly sendAdminInviteDto: SendAdminInviteDto;
}

/**
 * Request parameters for adminSettingsControllerSetAdminStatusV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerSetAdminStatusV1Request {
  readonly adminId: string;

  readonly setAdminStatusDto: SetAdminStatusDto;
}

/**
 * Request parameters for adminSettingsControllerSetPasswordV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerSetPasswordV1Request {
  readonly setAdminPasswordDto: SetAdminPasswordDto;
}

/**
 * Request parameters for adminSettingsControllerUpdateLocaleV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerUpdateLocaleV1Request {
  readonly updateLocaleDto: UpdateLocaleDto;
}

/**
 * Request parameters for adminSettingsControllerUpdatePlatformSettingsV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerUpdatePlatformSettingsV1Request {
  readonly updatePlatformSettingsDto: UpdatePlatformSettingsDto;
}

/**
 * AdminSettingsApi - object-oriented interface
 */
export class AdminSettingsApi
  extends BaseAPI
  implements AdminSettingsApiInterface
{
  /**
   * Mints a short-lived, provider-signed authorization the client uploads the new avatar image directly with — the backend never sees the file itself. Call this first, upload to the provider, then confirm what actually landed via the confirm route below.
   * @summary Get a signed avatar upload authorization
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminAvatarControllerAuthorizeV1(options?: RawAxiosRequestConfig) {
    return AdminSettingsApiFp(this.configuration)
      .adminAvatarControllerAuthorizeV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Independently verifies the uploaded asset against the provider (never trusting the client\'s own claim) and, once verified, stores it as this admin\'s current avatar — replacing any previous one.
   * @summary Confirm an uploaded avatar
   * @param {AdminSettingsApiAdminAvatarControllerConfirmAvatarV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminAvatarControllerConfirmAvatarV1(
    requestParameters: AdminSettingsApiAdminAvatarControllerConfirmAvatarV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminAvatarControllerConfirmAvatarV1(
        requestParameters.confirmAvatarDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * No session to revoke afterward — a platform admin has no refresh-token concept yet, so there is nothing else to rotate on a successful change.
   * @summary Change the signed-in platform admin\'s own password
   * @param {AdminSettingsApiAdminSettingsControllerChangePasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerChangePasswordV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerChangePasswordV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerChangePasswordV1(
        requestParameters.changeAdminPasswordDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   *
   * @summary Get the signed-in platform admin\'s own profile
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerGetProfileV1(options?: RawAxiosRequestConfig) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerGetProfileV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Despite the name, this is the full admin roster (matching the frontend\'s PlatformAdminInvite[] shape), not only pending invites — each row also carries its own invite metadata where one exists.
   * @summary List every platform admin, including the seeded root
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerListInvitesV1(options?: RawAxiosRequestConfig) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerListInvitesV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Only for an admin with no password yet (accepted their invite via Google, or was seeded before this flow existed). Mailed to the account\'s own address — proof the caller still controls that mailbox, since an access token alone is not enough to grant a passwordless account a permanent credential.
   * @summary Request the OTP required to add a first password
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerRequestSetPasswordOtpV1(
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerRequestSetPasswordOtpV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Deletes the invited admin\'s row outright — only while it is still `invited`. An admin who has already accepted or been disabled cannot be revoked through this route.
   * @summary Revoke a pending invite
   * @param {AdminSettingsApiAdminSettingsControllerRevokeInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerRevokeInviteV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerRevokeInviteV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerRevokeInviteV1(
        requestParameters.inviteId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Creates the invited admin\'s own row (status \"invited\", no password) and a 7-day invite token record. Does **not** email the invite or expose an accept-invite endpoint yet — that pairing is separate, comparably-sized follow-up work.
   * @summary Invite a new platform admin
   * @param {AdminSettingsApiAdminSettingsControllerSendInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerSendInviteV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerSendInviteV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerSendInviteV1(
        requestParameters.sendAdminInviteDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Sets another admin `active`/`disabled`. Combined with the per-request status check in JwtStrategy, a disable ends the target admin’s access on their next request. Cannot target yourself, an invited (not-yet-accepted) admin, or the last active admin.
   * @summary Disable or re-enable a platform admin
   * @param {AdminSettingsApiAdminSettingsControllerSetAdminStatusV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerSetAdminStatusV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerSetAdminStatusV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerSetAdminStatusV1(
        requestParameters.adminId,
        requestParameters.setAdminStatusDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Requires the OTP from `POST .../set-password/request-otp`. No token to reissue afterward — a platform admin has no refresh token, so there is nothing else to rotate.
   * @summary Set the signed-in platform admin\'s first password
   * @param {AdminSettingsApiAdminSettingsControllerSetPasswordV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerSetPasswordV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerSetPasswordV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerSetPasswordV1(
        requestParameters.setAdminPasswordDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Persists `platform_admins.locale`, then re-signs the access token (no refresh token to touch — a platform admin has none) so the new value is on its `locale` claim right away rather than waiting for the next login. Platform-admin tokens only.
   * @summary Set the language responses are rendered in
   * @param {AdminSettingsApiAdminSettingsControllerUpdateLocaleV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerUpdateLocaleV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerUpdateLocaleV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerUpdateLocaleV1(
        requestParameters.updateLocaleDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false, and one that would turn socialLoginEnabled off while a platform admin has Google as their only credential (an admin who accepted their invite through Google has no password, and there is no admin set-password flow to add one) — see the 400 response. Otherwise does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
   * @summary Update platform-wide feature settings
   * @param {AdminSettingsApiAdminSettingsControllerUpdatePlatformSettingsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerUpdatePlatformSettingsV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerUpdatePlatformSettingsV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerUpdatePlatformSettingsV1(
        requestParameters.updatePlatformSettingsDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
