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
import type { AdminStatisticsSummaryResponseDto } from '../models';
/**
 * AdminStatisticsApi - axios parameter creator
 */
export const AdminStatisticsApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Deeper than the Overview page\'s four headline stat cards: reply rate, average rating, sync success rate, connection health, plus review-volume trend, rating distribution and classification breakdown — every figure aggregated across every tenant.
     * @summary Platform-wide review/sync statistics
     * @param {number} [months] How many trailing calendar months the &#x60;reviewsTrend&#x60; series covers, counting back from the current one (inclusive). The other summary figures are all-time, not windowed by this.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminStatisticsControllerGetSummaryV1: async (
      months?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/statistics/summary`;
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

      if (months !== undefined) {
        localVarQueryParameter['months'] = months;
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
 * AdminStatisticsApi - functional programming interface
 */
export const AdminStatisticsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminStatisticsApiAxiosParamCreator(configuration);
  return {
    /**
     * Deeper than the Overview page\'s four headline stat cards: reply rate, average rating, sync success rate, connection health, plus review-volume trend, rating distribution and classification breakdown — every figure aggregated across every tenant.
     * @summary Platform-wide review/sync statistics
     * @param {number} [months] How many trailing calendar months the &#x60;reviewsTrend&#x60; series covers, counting back from the current one (inclusive). The other summary figures are all-time, not windowed by this.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminStatisticsControllerGetSummaryV1(
      months?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminStatisticsSummaryResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminStatisticsControllerGetSummaryV1(
          months,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminStatisticsApi.adminStatisticsControllerGetSummaryV1'
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
 * AdminStatisticsApi - factory interface
 */
export const AdminStatisticsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AdminStatisticsApiFp(configuration);
  return {
    /**
     * Deeper than the Overview page\'s four headline stat cards: reply rate, average rating, sync success rate, connection health, plus review-volume trend, rating distribution and classification breakdown — every figure aggregated across every tenant.
     * @summary Platform-wide review/sync statistics
     * @param {AdminStatisticsApiAdminStatisticsControllerGetSummaryV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminStatisticsControllerGetSummaryV1(
      requestParameters: AdminStatisticsApiAdminStatisticsControllerGetSummaryV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminStatisticsSummaryResponseDto> {
      return localVarFp
        .adminStatisticsControllerGetSummaryV1(
          requestParameters.months,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminStatisticsApi - interface
 */
export interface AdminStatisticsApiInterface {
  /**
   * Deeper than the Overview page\'s four headline stat cards: reply rate, average rating, sync success rate, connection health, plus review-volume trend, rating distribution and classification breakdown — every figure aggregated across every tenant.
   * @summary Platform-wide review/sync statistics
   * @param {AdminStatisticsApiAdminStatisticsControllerGetSummaryV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminStatisticsControllerGetSummaryV1(
    requestParameters?: AdminStatisticsApiAdminStatisticsControllerGetSummaryV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminStatisticsSummaryResponseDto>;
}

/**
 * Request parameters for adminStatisticsControllerGetSummaryV1 operation in AdminStatisticsApi.
 */
export interface AdminStatisticsApiAdminStatisticsControllerGetSummaryV1Request {
  /**
   * How many trailing calendar months the &#x60;reviewsTrend&#x60; series covers, counting back from the current one (inclusive). The other summary figures are all-time, not windowed by this.
   */
  readonly months?: number;
}

/**
 * AdminStatisticsApi - object-oriented interface
 */
export class AdminStatisticsApi
  extends BaseAPI
  implements AdminStatisticsApiInterface
{
  /**
   * Deeper than the Overview page\'s four headline stat cards: reply rate, average rating, sync success rate, connection health, plus review-volume trend, rating distribution and classification breakdown — every figure aggregated across every tenant.
   * @summary Platform-wide review/sync statistics
   * @param {AdminStatisticsApiAdminStatisticsControllerGetSummaryV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminStatisticsControllerGetSummaryV1(
    requestParameters: AdminStatisticsApiAdminStatisticsControllerGetSummaryV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminStatisticsApiFp(this.configuration)
      .adminStatisticsControllerGetSummaryV1(requestParameters.months, options)
      .then((request) => request(this.axios, this.basePath));
  }
}
