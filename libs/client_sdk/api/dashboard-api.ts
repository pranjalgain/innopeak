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
import type { MetricsDto } from '../models';
// @ts-ignore
import type { RecentEscalatedDto } from '../models';
/**
 * DashboardApi - axios parameter creator
 */
export const DashboardApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. `total`, `avgRating` and `ratingDistribution` cover the trailing `days` window, measured on `reviewed_at` (when the review was left) rather than `created_at` (when the sync imported it). `pending` and `escalated` are open-backlog counts and are intentionally not windowed — see the response schema for why. `ratingDistribution` buckets 1-5 are always present, zero-filled. `locationId` scopes every count to one location; omitted means every location the tenant has confirmed, aggregated together.
     * @summary Aggregated metrics for the dashboard stat cards
     * @param {number} [days] Size of the trailing window, counted from &#x60;reviewed_at&#x60;.
     * @param {string} [locationId] Scope to one location (&#x60;locations.id&#x60;). Omitted means every location the tenant has confirmed, aggregated — matching this endpoint\&#39;s behavior before multi-location existed. A location from another tenant yields zero rows, not a 403, same as the reviews list\&#39;s own locationId filter.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    dashboardControllerGetMetricsV1: async (
      days?: number,
      locationId?: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/dashboard/metrics`;
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

      if (days !== undefined) {
        localVarQueryParameter['days'] = days;
      }

      if (locationId !== undefined) {
        localVarQueryParameter['locationId'] = locationId;
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
     * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. Newest `reviewed_at` first, restricted to reviews still open (status `new` or `in_review`) so a resolved escalation drops off the list. Carries the stored `escalationReason` — the client must not infer it from the star rating, since a 5-star blocklist match is routine. `locationId` scopes the list to one location; omitted means every location the tenant has confirmed.
     * @summary Most recent escalated reviews still awaiting action
     * @param {number} [limit]
     * @param {string} [locationId] Scope to one location (&#x60;locations.id&#x60;). Omitted means every location, aggregated.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    dashboardControllerGetRecentEscalatedV1: async (
      limit?: number,
      locationId?: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/dashboard/recent-escalated`;
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

      if (locationId !== undefined) {
        localVarQueryParameter['locationId'] = locationId;
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
 * DashboardApi - functional programming interface
 */
export const DashboardApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    DashboardApiAxiosParamCreator(configuration);
  return {
    /**
     * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. `total`, `avgRating` and `ratingDistribution` cover the trailing `days` window, measured on `reviewed_at` (when the review was left) rather than `created_at` (when the sync imported it). `pending` and `escalated` are open-backlog counts and are intentionally not windowed — see the response schema for why. `ratingDistribution` buckets 1-5 are always present, zero-filled. `locationId` scopes every count to one location; omitted means every location the tenant has confirmed, aggregated together.
     * @summary Aggregated metrics for the dashboard stat cards
     * @param {number} [days] Size of the trailing window, counted from &#x60;reviewed_at&#x60;.
     * @param {string} [locationId] Scope to one location (&#x60;locations.id&#x60;). Omitted means every location the tenant has confirmed, aggregated — matching this endpoint\&#39;s behavior before multi-location existed. A location from another tenant yields zero rows, not a 403, same as the reviews list\&#39;s own locationId filter.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async dashboardControllerGetMetricsV1(
      days?: number,
      locationId?: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<MetricsDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.dashboardControllerGetMetricsV1(
          days,
          locationId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['DashboardApi.dashboardControllerGetMetricsV1']?.[
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
     * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. Newest `reviewed_at` first, restricted to reviews still open (status `new` or `in_review`) so a resolved escalation drops off the list. Carries the stored `escalationReason` — the client must not infer it from the star rating, since a 5-star blocklist match is routine. `locationId` scopes the list to one location; omitted means every location the tenant has confirmed.
     * @summary Most recent escalated reviews still awaiting action
     * @param {number} [limit]
     * @param {string} [locationId] Scope to one location (&#x60;locations.id&#x60;). Omitted means every location, aggregated.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async dashboardControllerGetRecentEscalatedV1(
      limit?: number,
      locationId?: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<RecentEscalatedDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.dashboardControllerGetRecentEscalatedV1(
          limit,
          locationId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'DashboardApi.dashboardControllerGetRecentEscalatedV1'
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
 * DashboardApi - factory interface
 */
export const DashboardApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = DashboardApiFp(configuration);
  return {
    /**
     * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. `total`, `avgRating` and `ratingDistribution` cover the trailing `days` window, measured on `reviewed_at` (when the review was left) rather than `created_at` (when the sync imported it). `pending` and `escalated` are open-backlog counts and are intentionally not windowed — see the response schema for why. `ratingDistribution` buckets 1-5 are always present, zero-filled. `locationId` scopes every count to one location; omitted means every location the tenant has confirmed, aggregated together.
     * @summary Aggregated metrics for the dashboard stat cards
     * @param {DashboardApiDashboardControllerGetMetricsV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    dashboardControllerGetMetricsV1(
      requestParameters: DashboardApiDashboardControllerGetMetricsV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<MetricsDto> {
      return localVarFp
        .dashboardControllerGetMetricsV1(
          requestParameters.days,
          requestParameters.locationId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. Newest `reviewed_at` first, restricted to reviews still open (status `new` or `in_review`) so a resolved escalation drops off the list. Carries the stored `escalationReason` — the client must not infer it from the star rating, since a 5-star blocklist match is routine. `locationId` scopes the list to one location; omitted means every location the tenant has confirmed.
     * @summary Most recent escalated reviews still awaiting action
     * @param {DashboardApiDashboardControllerGetRecentEscalatedV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    dashboardControllerGetRecentEscalatedV1(
      requestParameters: DashboardApiDashboardControllerGetRecentEscalatedV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<RecentEscalatedDto>> {
      return localVarFp
        .dashboardControllerGetRecentEscalatedV1(
          requestParameters.limit,
          requestParameters.locationId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * DashboardApi - interface
 */
export interface DashboardApiInterface {
  /**
   * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. `total`, `avgRating` and `ratingDistribution` cover the trailing `days` window, measured on `reviewed_at` (when the review was left) rather than `created_at` (when the sync imported it). `pending` and `escalated` are open-backlog counts and are intentionally not windowed — see the response schema for why. `ratingDistribution` buckets 1-5 are always present, zero-filled. `locationId` scopes every count to one location; omitted means every location the tenant has confirmed, aggregated together.
   * @summary Aggregated metrics for the dashboard stat cards
   * @param {DashboardApiDashboardControllerGetMetricsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  dashboardControllerGetMetricsV1(
    requestParameters?: DashboardApiDashboardControllerGetMetricsV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<MetricsDto>;

  /**
   * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. Newest `reviewed_at` first, restricted to reviews still open (status `new` or `in_review`) so a resolved escalation drops off the list. Carries the stored `escalationReason` — the client must not infer it from the star rating, since a 5-star blocklist match is routine. `locationId` scopes the list to one location; omitted means every location the tenant has confirmed.
   * @summary Most recent escalated reviews still awaiting action
   * @param {DashboardApiDashboardControllerGetRecentEscalatedV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  dashboardControllerGetRecentEscalatedV1(
    requestParameters?: DashboardApiDashboardControllerGetRecentEscalatedV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<RecentEscalatedDto>>;
}

/**
 * Request parameters for dashboardControllerGetMetricsV1 operation in DashboardApi.
 */
export interface DashboardApiDashboardControllerGetMetricsV1Request {
  /**
   * Size of the trailing window, counted from &#x60;reviewed_at&#x60;.
   */
  readonly days?: number;

  /**
   * Scope to one location (&#x60;locations.id&#x60;). Omitted means every location the tenant has confirmed, aggregated — matching this endpoint\&#39;s behavior before multi-location existed. A location from another tenant yields zero rows, not a 403, same as the reviews list\&#39;s own locationId filter.
   */
  readonly locationId?: string;
}

/**
 * Request parameters for dashboardControllerGetRecentEscalatedV1 operation in DashboardApi.
 */
export interface DashboardApiDashboardControllerGetRecentEscalatedV1Request {
  readonly limit?: number;

  /**
   * Scope to one location (&#x60;locations.id&#x60;). Omitted means every location, aggregated.
   */
  readonly locationId?: string;
}

/**
 * DashboardApi - object-oriented interface
 */
export class DashboardApi extends BaseAPI implements DashboardApiInterface {
  /**
   * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. `total`, `avgRating` and `ratingDistribution` cover the trailing `days` window, measured on `reviewed_at` (when the review was left) rather than `created_at` (when the sync imported it). `pending` and `escalated` are open-backlog counts and are intentionally not windowed — see the response schema for why. `ratingDistribution` buckets 1-5 are always present, zero-filled. `locationId` scopes every count to one location; omitted means every location the tenant has confirmed, aggregated together.
   * @summary Aggregated metrics for the dashboard stat cards
   * @param {DashboardApiDashboardControllerGetMetricsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public dashboardControllerGetMetricsV1(
    requestParameters: DashboardApiDashboardControllerGetMetricsV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return DashboardApiFp(this.configuration)
      .dashboardControllerGetMetricsV1(
        requestParameters.days,
        requestParameters.locationId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Scoped to the caller\'s own tenant, taken from the access token. There is deliberately no tenant parameter — one would let any authenticated user read another business\'s data. Newest `reviewed_at` first, restricted to reviews still open (status `new` or `in_review`) so a resolved escalation drops off the list. Carries the stored `escalationReason` — the client must not infer it from the star rating, since a 5-star blocklist match is routine. `locationId` scopes the list to one location; omitted means every location the tenant has confirmed.
   * @summary Most recent escalated reviews still awaiting action
   * @param {DashboardApiDashboardControllerGetRecentEscalatedV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public dashboardControllerGetRecentEscalatedV1(
    requestParameters: DashboardApiDashboardControllerGetRecentEscalatedV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return DashboardApiFp(this.configuration)
      .dashboardControllerGetRecentEscalatedV1(
        requestParameters.limit,
        requestParameters.locationId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
