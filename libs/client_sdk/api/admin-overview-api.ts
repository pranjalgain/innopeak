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
import type { AdminBusinessResponseDto } from '../models';
// @ts-ignore
import type { AdminOverviewStatsResponseDto } from '../models';
// @ts-ignore
import type { AdminSignupTrendPointResponseDto } from '../models';
// @ts-ignore
import type { PlatformActivityListResponseDto } from '../models';
// @ts-ignore
import type { PlatformActivityResponseDto } from '../models';
/**
 * AdminOverviewApi - axios parameter creator
 */
export const AdminOverviewApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Non-connected tenants (disconnected, needs re-auth, or never onboarded), most urgent first, capped at `limit` — a broken connection on a live customer outranks a tenant that never finished onboarding.
     * @summary Businesses needing attention
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetNeedsAttentionV1: async (
      limit?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/overview/needs-attention`;
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
     * The purpose-built admin-action log (`platform_activity_log`: business suspend/reactivate, admin invite send/revoke, admin/user enable-disable) merged with synthesized `business_joined` entries (a signup has no platform-admin actor, so it was never added to that log) into one time-sorted, capped feed. Previously two endpoints stitched together client-side; this is the one response the Overview activity panel now needs. See `ApiListPlatformActivity` for the paginated, real-log-only view instead.
     * @summary Recent platform activity — the Overview page’s glance feed
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
     * The newest tenants, newest first, capped at `limit` — the Overview page\'s \"Recent Businesses\" card. Same shape as `GET /v1/admin/businesses`, just a smaller page of it.
     * @summary Most recently created businesses
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetRecentBusinessesV1: async (
      limit?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/overview/recent-businesses`;
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
     * Tenant signup counts bucketed by calendar month (UTC) over the trailing `months` months, oldest first. Every month in the window is present, including zero-signup ones.
     * @summary Tenant signups by month
     * @param {number} [months] How many trailing calendar months to include, counting back from the current one (inclusive).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetSignupTrendV1: async (
      months?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/overview/signup-trend`;
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
    /**
     * Total businesses, total users, total reviews synced and total replies posted — the four figures behind the Overview page\'s stat cards, aggregated across every tenant.
     * @summary Overview stat cards
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetStatsV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/overview/stats`;
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
     * The same `platform_activity_log` rows `ApiGetRecentActivity` reads, but paginated and filterable by type rather than a bounded top-N read — backs a dedicated Activity view rather than the Overview page\'s small glance card.
     * @summary Paginated, filterable platform-admin action history
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {AdminOverviewControllerListActivityV1TypeEnum} [type]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerListActivityV1: async (
      page?: number,
      pageSize?: number,
      type?: AdminOverviewControllerListActivityV1TypeEnum,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/overview/activity-log`;
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

      if (page !== undefined) {
        localVarQueryParameter['page'] = page;
      }

      if (pageSize !== undefined) {
        localVarQueryParameter['pageSize'] = pageSize;
      }

      if (type !== undefined) {
        localVarQueryParameter['type'] = type;
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
 * AdminOverviewApi - functional programming interface
 */
export const AdminOverviewApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminOverviewApiAxiosParamCreator(configuration);
  return {
    /**
     * Non-connected tenants (disconnected, needs re-auth, or never onboarded), most urgent first, capped at `limit` — a broken connection on a live customer outranks a tenant that never finished onboarding.
     * @summary Businesses needing attention
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminOverviewControllerGetNeedsAttentionV1(
      limit?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<AdminBusinessResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminOverviewControllerGetNeedsAttentionV1(
          limit,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminOverviewApi.adminOverviewControllerGetNeedsAttentionV1'
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
     * The purpose-built admin-action log (`platform_activity_log`: business suspend/reactivate, admin invite send/revoke, admin/user enable-disable) merged with synthesized `business_joined` entries (a signup has no platform-admin actor, so it was never added to that log) into one time-sorted, capped feed. Previously two endpoints stitched together client-side; this is the one response the Overview activity panel now needs. See `ApiListPlatformActivity` for the paginated, real-log-only view instead.
     * @summary Recent platform activity — the Overview page’s glance feed
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
     * The newest tenants, newest first, capped at `limit` — the Overview page\'s \"Recent Businesses\" card. Same shape as `GET /v1/admin/businesses`, just a smaller page of it.
     * @summary Most recently created businesses
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminOverviewControllerGetRecentBusinessesV1(
      limit?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<AdminBusinessResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminOverviewControllerGetRecentBusinessesV1(
          limit,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminOverviewApi.adminOverviewControllerGetRecentBusinessesV1'
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
     * Tenant signup counts bucketed by calendar month (UTC) over the trailing `months` months, oldest first. Every month in the window is present, including zero-signup ones.
     * @summary Tenant signups by month
     * @param {number} [months] How many trailing calendar months to include, counting back from the current one (inclusive).
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminOverviewControllerGetSignupTrendV1(
      months?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<AdminSignupTrendPointResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminOverviewControllerGetSignupTrendV1(
          months,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminOverviewApi.adminOverviewControllerGetSignupTrendV1'
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
     * Total businesses, total users, total reviews synced and total replies posted — the four figures behind the Overview page\'s stat cards, aggregated across every tenant.
     * @summary Overview stat cards
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminOverviewControllerGetStatsV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminOverviewStatsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminOverviewControllerGetStatsV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminOverviewApi.adminOverviewControllerGetStatsV1'
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
     * The same `platform_activity_log` rows `ApiGetRecentActivity` reads, but paginated and filterable by type rather than a bounded top-N read — backs a dedicated Activity view rather than the Overview page\'s small glance card.
     * @summary Paginated, filterable platform-admin action history
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {AdminOverviewControllerListActivityV1TypeEnum} [type]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminOverviewControllerListActivityV1(
      page?: number,
      pageSize?: number,
      type?: AdminOverviewControllerListActivityV1TypeEnum,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<PlatformActivityListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminOverviewControllerListActivityV1(
          page,
          pageSize,
          type,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminOverviewApi.adminOverviewControllerListActivityV1'
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
     * Non-connected tenants (disconnected, needs re-auth, or never onboarded), most urgent first, capped at `limit` — a broken connection on a live customer outranks a tenant that never finished onboarding.
     * @summary Businesses needing attention
     * @param {AdminOverviewApiAdminOverviewControllerGetNeedsAttentionV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetNeedsAttentionV1(
      requestParameters: AdminOverviewApiAdminOverviewControllerGetNeedsAttentionV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<AdminBusinessResponseDto>> {
      return localVarFp
        .adminOverviewControllerGetNeedsAttentionV1(
          requestParameters.limit,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * The purpose-built admin-action log (`platform_activity_log`: business suspend/reactivate, admin invite send/revoke, admin/user enable-disable) merged with synthesized `business_joined` entries (a signup has no platform-admin actor, so it was never added to that log) into one time-sorted, capped feed. Previously two endpoints stitched together client-side; this is the one response the Overview activity panel now needs. See `ApiListPlatformActivity` for the paginated, real-log-only view instead.
     * @summary Recent platform activity — the Overview page’s glance feed
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
     * The newest tenants, newest first, capped at `limit` — the Overview page\'s \"Recent Businesses\" card. Same shape as `GET /v1/admin/businesses`, just a smaller page of it.
     * @summary Most recently created businesses
     * @param {AdminOverviewApiAdminOverviewControllerGetRecentBusinessesV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetRecentBusinessesV1(
      requestParameters: AdminOverviewApiAdminOverviewControllerGetRecentBusinessesV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<AdminBusinessResponseDto>> {
      return localVarFp
        .adminOverviewControllerGetRecentBusinessesV1(
          requestParameters.limit,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Tenant signup counts bucketed by calendar month (UTC) over the trailing `months` months, oldest first. Every month in the window is present, including zero-signup ones.
     * @summary Tenant signups by month
     * @param {AdminOverviewApiAdminOverviewControllerGetSignupTrendV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetSignupTrendV1(
      requestParameters: AdminOverviewApiAdminOverviewControllerGetSignupTrendV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<AdminSignupTrendPointResponseDto>> {
      return localVarFp
        .adminOverviewControllerGetSignupTrendV1(
          requestParameters.months,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Total businesses, total users, total reviews synced and total replies posted — the four figures behind the Overview page\'s stat cards, aggregated across every tenant.
     * @summary Overview stat cards
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerGetStatsV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminOverviewStatsResponseDto> {
      return localVarFp
        .adminOverviewControllerGetStatsV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The same `platform_activity_log` rows `ApiGetRecentActivity` reads, but paginated and filterable by type rather than a bounded top-N read — backs a dedicated Activity view rather than the Overview page\'s small glance card.
     * @summary Paginated, filterable platform-admin action history
     * @param {AdminOverviewApiAdminOverviewControllerListActivityV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminOverviewControllerListActivityV1(
      requestParameters: AdminOverviewApiAdminOverviewControllerListActivityV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<PlatformActivityListResponseDto> {
      return localVarFp
        .adminOverviewControllerListActivityV1(
          requestParameters.page,
          requestParameters.pageSize,
          requestParameters.type,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminOverviewApi - interface
 */
export interface AdminOverviewApiInterface {
  /**
   * Non-connected tenants (disconnected, needs re-auth, or never onboarded), most urgent first, capped at `limit` — a broken connection on a live customer outranks a tenant that never finished onboarding.
   * @summary Businesses needing attention
   * @param {AdminOverviewApiAdminOverviewControllerGetNeedsAttentionV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerGetNeedsAttentionV1(
    requestParameters?: AdminOverviewApiAdminOverviewControllerGetNeedsAttentionV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<AdminBusinessResponseDto>>;

  /**
   * The purpose-built admin-action log (`platform_activity_log`: business suspend/reactivate, admin invite send/revoke, admin/user enable-disable) merged with synthesized `business_joined` entries (a signup has no platform-admin actor, so it was never added to that log) into one time-sorted, capped feed. Previously two endpoints stitched together client-side; this is the one response the Overview activity panel now needs. See `ApiListPlatformActivity` for the paginated, real-log-only view instead.
   * @summary Recent platform activity — the Overview page’s glance feed
   * @param {AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerGetRecentActivityV1(
    requestParameters?: AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<PlatformActivityResponseDto>>;

  /**
   * The newest tenants, newest first, capped at `limit` — the Overview page\'s \"Recent Businesses\" card. Same shape as `GET /v1/admin/businesses`, just a smaller page of it.
   * @summary Most recently created businesses
   * @param {AdminOverviewApiAdminOverviewControllerGetRecentBusinessesV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerGetRecentBusinessesV1(
    requestParameters?: AdminOverviewApiAdminOverviewControllerGetRecentBusinessesV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<AdminBusinessResponseDto>>;

  /**
   * Tenant signup counts bucketed by calendar month (UTC) over the trailing `months` months, oldest first. Every month in the window is present, including zero-signup ones.
   * @summary Tenant signups by month
   * @param {AdminOverviewApiAdminOverviewControllerGetSignupTrendV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerGetSignupTrendV1(
    requestParameters?: AdminOverviewApiAdminOverviewControllerGetSignupTrendV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<AdminSignupTrendPointResponseDto>>;

  /**
   * Total businesses, total users, total reviews synced and total replies posted — the four figures behind the Overview page\'s stat cards, aggregated across every tenant.
   * @summary Overview stat cards
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerGetStatsV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminOverviewStatsResponseDto>;

  /**
   * The same `platform_activity_log` rows `ApiGetRecentActivity` reads, but paginated and filterable by type rather than a bounded top-N read — backs a dedicated Activity view rather than the Overview page\'s small glance card.
   * @summary Paginated, filterable platform-admin action history
   * @param {AdminOverviewApiAdminOverviewControllerListActivityV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminOverviewControllerListActivityV1(
    requestParameters?: AdminOverviewApiAdminOverviewControllerListActivityV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<PlatformActivityListResponseDto>;
}

/**
 * Request parameters for adminOverviewControllerGetNeedsAttentionV1 operation in AdminOverviewApi.
 */
export interface AdminOverviewApiAdminOverviewControllerGetNeedsAttentionV1Request {
  readonly limit?: number;
}

/**
 * Request parameters for adminOverviewControllerGetRecentActivityV1 operation in AdminOverviewApi.
 */
export interface AdminOverviewApiAdminOverviewControllerGetRecentActivityV1Request {
  readonly limit?: number;
}

/**
 * Request parameters for adminOverviewControllerGetRecentBusinessesV1 operation in AdminOverviewApi.
 */
export interface AdminOverviewApiAdminOverviewControllerGetRecentBusinessesV1Request {
  readonly limit?: number;
}

/**
 * Request parameters for adminOverviewControllerGetSignupTrendV1 operation in AdminOverviewApi.
 */
export interface AdminOverviewApiAdminOverviewControllerGetSignupTrendV1Request {
  /**
   * How many trailing calendar months to include, counting back from the current one (inclusive).
   */
  readonly months?: number;
}

/**
 * Request parameters for adminOverviewControllerListActivityV1 operation in AdminOverviewApi.
 */
export interface AdminOverviewApiAdminOverviewControllerListActivityV1Request {
  readonly page?: number;

  readonly pageSize?: number;

  readonly type?: AdminOverviewControllerListActivityV1TypeEnum;
}

/**
 * AdminOverviewApi - object-oriented interface
 */
export class AdminOverviewApi
  extends BaseAPI
  implements AdminOverviewApiInterface
{
  /**
   * Non-connected tenants (disconnected, needs re-auth, or never onboarded), most urgent first, capped at `limit` — a broken connection on a live customer outranks a tenant that never finished onboarding.
   * @summary Businesses needing attention
   * @param {AdminOverviewApiAdminOverviewControllerGetNeedsAttentionV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminOverviewControllerGetNeedsAttentionV1(
    requestParameters: AdminOverviewApiAdminOverviewControllerGetNeedsAttentionV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminOverviewApiFp(this.configuration)
      .adminOverviewControllerGetNeedsAttentionV1(
        requestParameters.limit,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The purpose-built admin-action log (`platform_activity_log`: business suspend/reactivate, admin invite send/revoke, admin/user enable-disable) merged with synthesized `business_joined` entries (a signup has no platform-admin actor, so it was never added to that log) into one time-sorted, capped feed. Previously two endpoints stitched together client-side; this is the one response the Overview activity panel now needs. See `ApiListPlatformActivity` for the paginated, real-log-only view instead.
   * @summary Recent platform activity — the Overview page’s glance feed
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
   * The newest tenants, newest first, capped at `limit` — the Overview page\'s \"Recent Businesses\" card. Same shape as `GET /v1/admin/businesses`, just a smaller page of it.
   * @summary Most recently created businesses
   * @param {AdminOverviewApiAdminOverviewControllerGetRecentBusinessesV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminOverviewControllerGetRecentBusinessesV1(
    requestParameters: AdminOverviewApiAdminOverviewControllerGetRecentBusinessesV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminOverviewApiFp(this.configuration)
      .adminOverviewControllerGetRecentBusinessesV1(
        requestParameters.limit,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Tenant signup counts bucketed by calendar month (UTC) over the trailing `months` months, oldest first. Every month in the window is present, including zero-signup ones.
   * @summary Tenant signups by month
   * @param {AdminOverviewApiAdminOverviewControllerGetSignupTrendV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminOverviewControllerGetSignupTrendV1(
    requestParameters: AdminOverviewApiAdminOverviewControllerGetSignupTrendV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminOverviewApiFp(this.configuration)
      .adminOverviewControllerGetSignupTrendV1(
        requestParameters.months,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Total businesses, total users, total reviews synced and total replies posted — the four figures behind the Overview page\'s stat cards, aggregated across every tenant.
   * @summary Overview stat cards
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminOverviewControllerGetStatsV1(options?: RawAxiosRequestConfig) {
    return AdminOverviewApiFp(this.configuration)
      .adminOverviewControllerGetStatsV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The same `platform_activity_log` rows `ApiGetRecentActivity` reads, but paginated and filterable by type rather than a bounded top-N read — backs a dedicated Activity view rather than the Overview page\'s small glance card.
   * @summary Paginated, filterable platform-admin action history
   * @param {AdminOverviewApiAdminOverviewControllerListActivityV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminOverviewControllerListActivityV1(
    requestParameters: AdminOverviewApiAdminOverviewControllerListActivityV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminOverviewApiFp(this.configuration)
      .adminOverviewControllerListActivityV1(
        requestParameters.page,
        requestParameters.pageSize,
        requestParameters.type,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}

export const AdminOverviewControllerListActivityV1TypeEnum = {
  BusinessSuspended: 'business_suspended',
  BusinessReactivated: 'business_reactivated',
  BusinessErasureRequested: 'business_erasure_requested',
  BusinessErasureCancelled: 'business_erasure_cancelled',
  BusinessErased: 'business_erased',
  AdminInviteSent: 'admin_invite_sent',
  AdminInviteRevoked: 'admin_invite_revoked',
  UserActivated: 'user_activated',
  UserDeactivated: 'user_deactivated',
  AdminDisabled: 'admin_disabled',
  AdminEnabled: 'admin_enabled',
} as const;
export type AdminOverviewControllerListActivityV1TypeEnum =
  (typeof AdminOverviewControllerListActivityV1TypeEnum)[keyof typeof AdminOverviewControllerListActivityV1TypeEnum];
