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
import type { AdminUserListResponseDto } from '../models';
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
     * Platform-admin only. `search` is applied server-side (user name or business name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
     * @summary List every user across every tenant
     * @param {string} [search] Case-insensitive substring match against the user name or their business name.
     * @param {number} [page] 1-based page number.
     * @param {number} [pageSize]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminUsersControllerListV1: async (
      search?: string,
      page?: number,
      pageSize?: number,
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

      if (search !== undefined) {
        localVarQueryParameter['search'] = search;
      }

      if (page !== undefined) {
        localVarQueryParameter['page'] = page;
      }

      if (pageSize !== undefined) {
        localVarQueryParameter['pageSize'] = pageSize;
      }

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
     * @param {boolean} [active] The state to put the user in: &#x60;true&#x60; active, &#x60;false&#x60; deactivated. Already there, nothing changes (and nothing is logged), so a stale list or a double click cannot undo an earlier action. Omitted, the user is flipped from whatever they are now.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminUsersControllerToggleActiveV1: async (
      userId: string,
      active?: boolean,
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

      if (active !== undefined) {
        localVarQueryParameter['active'] = active;
      }

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
     * Platform-admin only. `search` is applied server-side (user name or business name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
     * @summary List every user across every tenant
     * @param {string} [search] Case-insensitive substring match against the user name or their business name.
     * @param {number} [page] 1-based page number.
     * @param {number} [pageSize]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminUsersControllerListV1(
      search?: string,
      page?: number,
      pageSize?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminUserListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminUsersControllerListV1(
          search,
          page,
          pageSize,
          options,
        );
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
     * @param {boolean} [active] The state to put the user in: &#x60;true&#x60; active, &#x60;false&#x60; deactivated. Already there, nothing changes (and nothing is logged), so a stale list or a double click cannot undo an earlier action. Omitted, the user is flipped from whatever they are now.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminUsersControllerToggleActiveV1(
      userId: string,
      active?: boolean,
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
          active,
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
     * Platform-admin only. `search` is applied server-side (user name or business name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
     * @summary List every user across every tenant
     * @param {AdminUsersApiAdminUsersControllerListV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminUsersControllerListV1(
      requestParameters: AdminUsersApiAdminUsersControllerListV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminUserListResponseDto> {
      return localVarFp
        .adminUsersControllerListV1(
          requestParameters.search,
          requestParameters.page,
          requestParameters.pageSize,
          options,
        )
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
        .adminUsersControllerToggleActiveV1(
          requestParameters.userId,
          requestParameters.active,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminUsersApi - interface
 */
export interface AdminUsersApiInterface {
  /**
   * Platform-admin only. `search` is applied server-side (user name or business name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
   * @summary List every user across every tenant
   * @param {AdminUsersApiAdminUsersControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminUsersControllerListV1(
    requestParameters?: AdminUsersApiAdminUsersControllerListV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminUserListResponseDto>;

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
 * Request parameters for adminUsersControllerListV1 operation in AdminUsersApi.
 */
export interface AdminUsersApiAdminUsersControllerListV1Request {
  /**
   * Case-insensitive substring match against the user name or their business name.
   */
  readonly search?: string;

  /**
   * 1-based page number.
   */
  readonly page?: number;

  readonly pageSize?: number;
}

/**
 * Request parameters for adminUsersControllerToggleActiveV1 operation in AdminUsersApi.
 */
export interface AdminUsersApiAdminUsersControllerToggleActiveV1Request {
  readonly userId: string;

  /**
   * The state to put the user in: &#x60;true&#x60; active, &#x60;false&#x60; deactivated. Already there, nothing changes (and nothing is logged), so a stale list or a double click cannot undo an earlier action. Omitted, the user is flipped from whatever they are now.
   */
  readonly active?: boolean;
}

/**
 * AdminUsersApi - object-oriented interface
 */
export class AdminUsersApi extends BaseAPI implements AdminUsersApiInterface {
  /**
   * Platform-admin only. `search` is applied server-side (user name or business name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
   * @summary List every user across every tenant
   * @param {AdminUsersApiAdminUsersControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminUsersControllerListV1(
    requestParameters: AdminUsersApiAdminUsersControllerListV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminUsersApiFp(this.configuration)
      .adminUsersControllerListV1(
        requestParameters.search,
        requestParameters.page,
        requestParameters.pageSize,
        options,
      )
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
      .adminUsersControllerToggleActiveV1(
        requestParameters.userId,
        requestParameters.active,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
