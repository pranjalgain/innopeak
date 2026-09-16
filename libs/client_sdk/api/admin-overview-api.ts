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
import type { PlatformActivityResponseDto } from '../models';
// @ts-ignore
import type { PlatformReviewStatsResponseDto } from '../models';
/**
 * AdminOverviewApi - axios parameter creator
 */
export const AdminOverviewApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * A purpose-built log (`platform_activity_log`) of business suspend/reactivate and admin invite send/revoke, newest first, with the real actor who performed each one.
     * @summary Most recent platform-admin actions
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetRecentActivityV1: async (
      limit?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/overview/activity`;
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

      if (limit !== undefined) {
        localVarQueryParameter['limit'] = limit;
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
     * Total reviews synced and total replies posted, aggregated across every tenant — not windowed, unlike the tenant dashboard\'s own metrics.
     * @summary Platform-wide review throughput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetReviewStatsV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/overview/review-stats`;
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
  };
};

/**
 * AdminOverviewApi - functional programming interface
 */
export const AdminOverviewApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminOverviewApiAxiosParamCreator(configuration);
  return {
    /**
     * A purpose-built log (`platform_activity_log`) of business suspend/reactivate and admin invite send/revoke, newest first, with the real actor who performed each one.
     * @summary Most recent platform-admin actions
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminOverviewControllerGetRecentActivityV1(
      limit?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<PlatformActivityResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminOverviewControllerGetRecentActivityV1(
          limit,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminOverviewApi.adminOverviewControllerGetRecentActivityV1'
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
     * Total reviews synced and total replies posted, aggregated across every tenant — not windowed, unlike the tenant dashboard\'s own metrics.
     * @summary Platform-wide review throughput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminOverviewControllerGetReviewStatsV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<PlatformReviewStatsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminOverviewControllerGetReviewStatsV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminOverviewApi.adminOverviewControllerGetReviewStatsV1'
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
 * AdminOverviewApi - factory interface
 */
export const AdminOverviewApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AdminOverviewApiFp(configuration);
  return {
    /**
     * A purpose-built log (`platform_activity_log`) of business suspend/reactivate and admin invite send/revoke, newest first, with the real actor who performed each one.
     * @summary Most recent platform-admin actions
     * @param {AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetRecentActivityV1(
      requestParameters: AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<PlatformActivityResponseDto>> {
      return localVarFp
        .adminOverviewControllerGetRecentActivityV1(
          requestParameters.limit,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Total reviews synced and total replies posted, aggregated across every tenant — not windowed, unlike the tenant dashboard\'s own metrics.
     * @summary Platform-wide review throughput
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetReviewStatsV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<PlatformReviewStatsResponseDto> {
      return localVarFp
        .adminOverviewControllerGetReviewStatsV1(options)
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminOverviewApi - interface
 */
export interface AdminOverviewApiInterface {
  /**
   * A purpose-built log (`platform_activity_log`) of business suspend/reactivate and admin invite send/revoke, newest first, with the real actor who performed each one.
   * @summary Most recent platform-admin actions
   * @param {AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerGetRecentActivityV1(
    requestParameters?: AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<PlatformActivityResponseDto>>;

  /**
   * Total reviews synced and total replies posted, aggregated across every tenant — not windowed, unlike the tenant dashboard\'s own metrics.
   * @summary Platform-wide review throughput
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerGetReviewStatsV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<PlatformReviewStatsResponseDto>;
}

/**
 * Request parameters for adminOverviewControllerGetRecentActivityV1 operation in AdminOverviewApi.
 */
export interface AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request {
  readonly limit?: number;
}

/**
 * AdminOverviewApi - object-oriented interface
 */
export class AdminOverviewApi
  extends BaseAPI
  implements AdminOverviewApiInterface
{
  /**
   * A purpose-built log (`platform_activity_log`) of business suspend/reactivate and admin invite send/revoke, newest first, with the real actor who performed each one.
   * @summary Most recent platform-admin actions
   * @param {AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminOverviewControllerGetRecentActivityV1(
    requestParameters: AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminOverviewApiFp(this.configuration)
      .adminOverviewControllerGetRecentActivityV1(
        requestParameters.limit,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Total reviews synced and total replies posted, aggregated across every tenant — not windowed, unlike the tenant dashboard\'s own metrics.
   * @summary Platform-wide review throughput
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminOverviewControllerGetReviewStatsV1(
    options?: RawAxiosRequestConfig,
  ) {
    return AdminOverviewApiFp(this.configuration)
      .adminOverviewControllerGetReviewStatsV1(options)
      .then((request) => request(this.axios, this.basePath));
  }
}
