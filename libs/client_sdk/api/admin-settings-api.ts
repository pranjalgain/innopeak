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
import type { ChangeAdminPasswordDto } from '../models';
// @ts-ignore
import type { PlatformSettingsResponseDto } from '../models';
// @ts-ignore
import type { SendAdminInviteDto } from '../models';
// @ts-ignore
import type { SetAdminStatusDto } from '../models';
// @ts-ignore
import type { UpdateAdminAvatarDto } from '../models';
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
     * Stores an already-hosted image URL — this does not accept a file upload.
     * @summary Set the avatar URL
     * @param {UpdateAdminAvatarDto} updateAdminAvatarDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerUpdateAvatarV1: async (
      updateAdminAvatarDto: UpdateAdminAvatarDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'updateAdminAvatarDto' is not null or undefined
      assertParamExists(
        'adminSettingsControllerUpdateAvatarV1',
        'updateAdminAvatarDto',
        updateAdminAvatarDto,
      );
      const localVarPath = `/v1/admin/settings/profile/avatar`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'PUT',
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
        updateAdminAvatarDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false — see the 400 response. Does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
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
     * Stores an already-hosted image URL — this does not accept a file upload.
     * @summary Set the avatar URL
     * @param {UpdateAdminAvatarDto} updateAdminAvatarDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminSettingsControllerUpdateAvatarV1(
      updateAdminAvatarDto: UpdateAdminAvatarDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminProfileResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminSettingsControllerUpdateAvatarV1(
          updateAdminAvatarDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminSettingsApi.adminSettingsControllerUpdateAvatarV1'
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
     * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false — see the 400 response. Does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
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
     * Stores an already-hosted image URL — this does not accept a file upload.
     * @summary Set the avatar URL
     * @param {AdminSettingsApiAdminSettingsControllerUpdateAvatarV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminSettingsControllerUpdateAvatarV1(
      requestParameters: AdminSettingsApiAdminSettingsControllerUpdateAvatarV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminProfileResponseDto> {
      return localVarFp
        .adminSettingsControllerUpdateAvatarV1(
          requestParameters.updateAdminAvatarDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false — see the 400 response. Does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
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
   * Stores an already-hosted image URL — this does not accept a file upload.
   * @summary Set the avatar URL
   * @param {AdminSettingsApiAdminSettingsControllerUpdateAvatarV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminSettingsControllerUpdateAvatarV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerUpdateAvatarV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminProfileResponseDto>;

  /**
   * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false — see the 400 response. Does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
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
 * Request parameters for adminSettingsControllerUpdateAvatarV1 operation in AdminSettingsApi.
 */
export interface AdminSettingsApiAdminSettingsControllerUpdateAvatarV1Request {
  readonly updateAdminAvatarDto: UpdateAdminAvatarDto;
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
   * Stores an already-hosted image URL — this does not accept a file upload.
   * @summary Set the avatar URL
   * @param {AdminSettingsApiAdminSettingsControllerUpdateAvatarV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminSettingsControllerUpdateAvatarV1(
    requestParameters: AdminSettingsApiAdminSettingsControllerUpdateAvatarV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminSettingsApiFp(this.configuration)
      .adminSettingsControllerUpdateAvatarV1(
        requestParameters.updateAdminAvatarDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Partial update — any field omitted is left unchanged. Controls which login methods the sign-in/sign-up screens offer and whether tenant Settings > Members can send invites. Takes effect immediately for every visitor; no redeploy required. Rejects a patch that would leave ssoLoginEnabled/passwordLoginEnabled/socialLoginEnabled all false — see the 400 response. Does not affect platform-admin login: a Super Admin\'s own password field on /login is unconditional regardless of this setting.
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
