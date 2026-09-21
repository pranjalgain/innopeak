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
import type { AdminUserResponseDto } from '../models';
/**
 * AdminUsersApi - axios parameter creator
 */
export const AdminUsersApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Platform-admin only. No pagination/filter params yet — the console does its own client-side paging over the full list.
     * @summary List every user across every tenant
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminUsersControllerListV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/users`;
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
     * A single toggle, not separate activate/deactivate calls: any status other than \'disabled\' flips to \'disabled\'. Re-enabling restores the status the user must have had before — \'active\' if their email was ever verified, otherwise \'pending_verification\', so disabling an unverified signup never doubles as verifying them.
     * @summary Toggle a user\'s active status
     * @param {string} userId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminUsersControllerToggleActiveV1: async (
      userId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'userId' is not null or undefined
      assertParamExists('adminUsersControllerToggleActiveV1', 'userId', userId);
      const localVarPath = `/v1/admin/users/{userId}/toggle-active`.replace(
        '{userId}',
        encodeURIComponent(String(userId)),
      );
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
  };
};

/**
 * AdminUsersApi - functional programming interface
 */
export const AdminUsersApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminUsersApiAxiosParamCreator(configuration);
  return {
    /**
     * Platform-admin only. No pagination/filter params yet — the console does its own client-side paging over the full list.
     * @summary List every user across every tenant
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminUsersControllerListV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<AdminUserResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminUsersControllerListV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AdminUsersApi.adminUsersControllerListV1']?.[
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
     * A single toggle, not separate activate/deactivate calls: any status other than \'disabled\' flips to \'disabled\'. Re-enabling restores the status the user must have had before — \'active\' if their email was ever verified, otherwise \'pending_verification\', so disabling an unverified signup never doubles as verifying them.
     * @summary Toggle a user\'s active status
     * @param {string} userId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminUsersControllerToggleActiveV1(
      userId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminUserResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminUsersControllerToggleActiveV1(
          userId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminUsersApi.adminUsersControllerToggleActiveV1'
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
 * AdminUsersApi - factory interface
 */
export const AdminUsersApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AdminUsersApiFp(configuration);
  return {
    /**
     * Platform-admin only. No pagination/filter params yet — the console does its own client-side paging over the full list.
     * @summary List every user across every tenant
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminUsersControllerListV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<AdminUserResponseDto>> {
      return localVarFp
        .adminUsersControllerListV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * A single toggle, not separate activate/deactivate calls: any status other than \'disabled\' flips to \'disabled\'. Re-enabling restores the status the user must have had before — \'active\' if their email was ever verified, otherwise \'pending_verification\', so disabling an unverified signup never doubles as verifying them.
     * @summary Toggle a user\'s active status
     * @param {AdminUsersApiAdminUsersControllerToggleActiveV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminUsersControllerToggleActiveV1(
      requestParameters: AdminUsersApiAdminUsersControllerToggleActiveV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminUserResponseDto> {
      return localVarFp
        .adminUsersControllerToggleActiveV1(requestParameters.userId, options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminUsersApi - interface
 */
export interface AdminUsersApiInterface {
  /**
   * Platform-admin only. No pagination/filter params yet — the console does its own client-side paging over the full list.
   * @summary List every user across every tenant
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminUsersControllerListV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<AdminUserResponseDto>>;

  /**
   * A single toggle, not separate activate/deactivate calls: any status other than \'disabled\' flips to \'disabled\'. Re-enabling restores the status the user must have had before — \'active\' if their email was ever verified, otherwise \'pending_verification\', so disabling an unverified signup never doubles as verifying them.
   * @summary Toggle a user\'s active status
   * @param {AdminUsersApiAdminUsersControllerToggleActiveV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminUsersControllerToggleActiveV1(
    requestParameters: AdminUsersApiAdminUsersControllerToggleActiveV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminUserResponseDto>;
}

/**
 * Request parameters for adminUsersControllerToggleActiveV1 operation in AdminUsersApi.
 */
export interface AdminUsersApiAdminUsersControllerToggleActiveV1Request {
  readonly userId: string;
}

/**
 * AdminUsersApi - object-oriented interface
 */
export class AdminUsersApi extends BaseAPI implements AdminUsersApiInterface {
  /**
   * Platform-admin only. No pagination/filter params yet — the console does its own client-side paging over the full list.
   * @summary List every user across every tenant
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminUsersControllerListV1(options?: RawAxiosRequestConfig) {
    return AdminUsersApiFp(this.configuration)
      .adminUsersControllerListV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * A single toggle, not separate activate/deactivate calls: any status other than \'disabled\' flips to \'disabled\'. Re-enabling restores the status the user must have had before — \'active\' if their email was ever verified, otherwise \'pending_verification\', so disabling an unverified signup never doubles as verifying them.
   * @summary Toggle a user\'s active status
   * @param {AdminUsersApiAdminUsersControllerToggleActiveV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminUsersControllerToggleActiveV1(
    requestParameters: AdminUsersApiAdminUsersControllerToggleActiveV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminUsersApiFp(this.configuration)
      .adminUsersControllerToggleActiveV1(requestParameters.userId, options)
      .then((request) => request(this.axios, this.basePath));
  }
}
