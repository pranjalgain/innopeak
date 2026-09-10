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
import type { BackfillProgressResponseDto } from '../models';
// @ts-ignore
import type { SyncHealthResponseDto } from '../models';
// @ts-ignore
import type { SyncRunListResponseDto } from '../models';
/**
 * ConnectionsSyncApi - axios parameter creator
 */
export const ConnectionsSyncApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Polled by the onboarding backfilling stage. **Terminal is `livePollingEnabled`, not `status`** — `status: \"ok\"` means the import job finished, while `onboardingBackfillCompletedAt` is what un-gates the live poller. Advancing the UI on `status` alone shows the owner \"you\'re all set\" for a location the scheduler still refuses to enqueue. `progress` is null whenever `totalToImport` is null or zero — the client shows an indeterminate bar rather than a fabricated percentage. Throttled at 120/min because a 2-second poll dies on the global 30/min tier inside the first minute.
     * @summary Progress of the one-time historical import
     * @param {string} locationId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsSyncControllerGetBackfillV1: async (
      locationId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'locationId' is not null or undefined
      assertParamExists(
        'connectionsSyncControllerGetBackfillV1',
        'locationId',
        locationId,
      );
      const localVarPath =
        `/v1/connections/locations/{locationId}/backfill`.replace(
          '{locationId}',
          encodeURIComponent(String(locationId)),
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
     * Assembled from the three places that each hold part of the answer: the location\'s rolled-up `last_sync_*` snapshot, the connection\'s credential health, and any `sync_runs` row currently running. `healthy` encodes the combination so no caller re-derives it — notably, an inactive location is not \"broken\", and a location that has never synced is not unhealthy.
     * @summary Is ingestion working for this location
     * @param {string} locationId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsSyncControllerGetSyncHealthV1: async (
      locationId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'locationId' is not null or undefined
      assertParamExists(
        'connectionsSyncControllerGetSyncHealthV1',
        'locationId',
        locationId,
      );
      const localVarPath =
        `/v1/connections/locations/{locationId}/sync-health`.replace(
          '{locationId}',
          encodeURIComponent(String(locationId)),
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
     * What makes \"why did this tenant never get review X\" answerable from the product rather than a shell on a production box. Both triggers appear in one feed on purpose: seeing the one-time `backfill` run beside the `scheduled` ones is how support confirms backfill actually ran, and a low `reviewsFetched` on it explains thin AI few-shot examples.
     * @summary Paginated sync-run history, newest first
     * @param {string} locationId
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {ConnectionsSyncControllerListSyncRunsV1StatusEnum} [status]
     * @param {ConnectionsSyncControllerListSyncRunsV1TriggerEnum} [trigger]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsSyncControllerListSyncRunsV1: async (
      locationId: string,
      page?: number,
      pageSize?: number,
      status?: ConnectionsSyncControllerListSyncRunsV1StatusEnum,
      trigger?: ConnectionsSyncControllerListSyncRunsV1TriggerEnum,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'locationId' is not null or undefined
      assertParamExists(
        'connectionsSyncControllerListSyncRunsV1',
        'locationId',
        locationId,
      );
      const localVarPath =
        `/v1/connections/locations/{locationId}/sync-runs`.replace(
          '{locationId}',
          encodeURIComponent(String(locationId)),
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

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

      if (page !== undefined) {
        localVarQueryParameter['page'] = page;
      }

      if (pageSize !== undefined) {
        localVarQueryParameter['pageSize'] = pageSize;
      }

      if (status !== undefined) {
        localVarQueryParameter['status'] = status;
      }

      if (trigger !== undefined) {
        localVarQueryParameter['trigger'] = trigger;
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
 * ConnectionsSyncApi - functional programming interface
 */
export const ConnectionsSyncApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    ConnectionsSyncApiAxiosParamCreator(configuration);
  return {
    /**
     * Polled by the onboarding backfilling stage. **Terminal is `livePollingEnabled`, not `status`** — `status: \"ok\"` means the import job finished, while `onboardingBackfillCompletedAt` is what un-gates the live poller. Advancing the UI on `status` alone shows the owner \"you\'re all set\" for a location the scheduler still refuses to enqueue. `progress` is null whenever `totalToImport` is null or zero — the client shows an indeterminate bar rather than a fabricated percentage. Throttled at 120/min because a 2-second poll dies on the global 30/min tier inside the first minute.
     * @summary Progress of the one-time historical import
     * @param {string} locationId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsSyncControllerGetBackfillV1(
      locationId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<BackfillProgressResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsSyncControllerGetBackfillV1(
          locationId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsSyncApi.connectionsSyncControllerGetBackfillV1'
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
     * Assembled from the three places that each hold part of the answer: the location\'s rolled-up `last_sync_*` snapshot, the connection\'s credential health, and any `sync_runs` row currently running. `healthy` encodes the combination so no caller re-derives it — notably, an inactive location is not \"broken\", and a location that has never synced is not unhealthy.
     * @summary Is ingestion working for this location
     * @param {string} locationId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsSyncControllerGetSyncHealthV1(
      locationId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<SyncHealthResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsSyncControllerGetSyncHealthV1(
          locationId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsSyncApi.connectionsSyncControllerGetSyncHealthV1'
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
     * What makes \"why did this tenant never get review X\" answerable from the product rather than a shell on a production box. Both triggers appear in one feed on purpose: seeing the one-time `backfill` run beside the `scheduled` ones is how support confirms backfill actually ran, and a low `reviewsFetched` on it explains thin AI few-shot examples.
     * @summary Paginated sync-run history, newest first
     * @param {string} locationId
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {ConnectionsSyncControllerListSyncRunsV1StatusEnum} [status]
     * @param {ConnectionsSyncControllerListSyncRunsV1TriggerEnum} [trigger]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsSyncControllerListSyncRunsV1(
      locationId: string,
      page?: number,
      pageSize?: number,
      status?: ConnectionsSyncControllerListSyncRunsV1StatusEnum,
      trigger?: ConnectionsSyncControllerListSyncRunsV1TriggerEnum,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<SyncRunListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsSyncControllerListSyncRunsV1(
          locationId,
          page,
          pageSize,
          status,
          trigger,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsSyncApi.connectionsSyncControllerListSyncRunsV1'
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
 * ConnectionsSyncApi - factory interface
 */
export const ConnectionsSyncApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = ConnectionsSyncApiFp(configuration);
  return {
    /**
     * Polled by the onboarding backfilling stage. **Terminal is `livePollingEnabled`, not `status`** — `status: \"ok\"` means the import job finished, while `onboardingBackfillCompletedAt` is what un-gates the live poller. Advancing the UI on `status` alone shows the owner \"you\'re all set\" for a location the scheduler still refuses to enqueue. `progress` is null whenever `totalToImport` is null or zero — the client shows an indeterminate bar rather than a fabricated percentage. Throttled at 120/min because a 2-second poll dies on the global 30/min tier inside the first minute.
     * @summary Progress of the one-time historical import
     * @param {ConnectionsSyncApiConnectionsSyncControllerGetBackfillV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsSyncControllerGetBackfillV1(
      requestParameters: ConnectionsSyncApiConnectionsSyncControllerGetBackfillV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<BackfillProgressResponseDto> {
      return localVarFp
        .connectionsSyncControllerGetBackfillV1(
          requestParameters.locationId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Assembled from the three places that each hold part of the answer: the location\'s rolled-up `last_sync_*` snapshot, the connection\'s credential health, and any `sync_runs` row currently running. `healthy` encodes the combination so no caller re-derives it — notably, an inactive location is not \"broken\", and a location that has never synced is not unhealthy.
     * @summary Is ingestion working for this location
     * @param {ConnectionsSyncApiConnectionsSyncControllerGetSyncHealthV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsSyncControllerGetSyncHealthV1(
      requestParameters: ConnectionsSyncApiConnectionsSyncControllerGetSyncHealthV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<SyncHealthResponseDto> {
      return localVarFp
        .connectionsSyncControllerGetSyncHealthV1(
          requestParameters.locationId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * What makes \"why did this tenant never get review X\" answerable from the product rather than a shell on a production box. Both triggers appear in one feed on purpose: seeing the one-time `backfill` run beside the `scheduled` ones is how support confirms backfill actually ran, and a low `reviewsFetched` on it explains thin AI few-shot examples.
     * @summary Paginated sync-run history, newest first
     * @param {ConnectionsSyncApiConnectionsSyncControllerListSyncRunsV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsSyncControllerListSyncRunsV1(
      requestParameters: ConnectionsSyncApiConnectionsSyncControllerListSyncRunsV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<SyncRunListResponseDto> {
      return localVarFp
        .connectionsSyncControllerListSyncRunsV1(
          requestParameters.locationId,
          requestParameters.page,
          requestParameters.pageSize,
          requestParameters.status,
          requestParameters.trigger,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * ConnectionsSyncApi - interface
 */
export interface ConnectionsSyncApiInterface {
  /**
   * Polled by the onboarding backfilling stage. **Terminal is `livePollingEnabled`, not `status`** — `status: \"ok\"` means the import job finished, while `onboardingBackfillCompletedAt` is what un-gates the live poller. Advancing the UI on `status` alone shows the owner \"you\'re all set\" for a location the scheduler still refuses to enqueue. `progress` is null whenever `totalToImport` is null or zero — the client shows an indeterminate bar rather than a fabricated percentage. Throttled at 120/min because a 2-second poll dies on the global 30/min tier inside the first minute.
   * @summary Progress of the one-time historical import
   * @param {ConnectionsSyncApiConnectionsSyncControllerGetBackfillV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsSyncControllerGetBackfillV1(
    requestParameters: ConnectionsSyncApiConnectionsSyncControllerGetBackfillV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<BackfillProgressResponseDto>;

  /**
   * Assembled from the three places that each hold part of the answer: the location\'s rolled-up `last_sync_*` snapshot, the connection\'s credential health, and any `sync_runs` row currently running. `healthy` encodes the combination so no caller re-derives it — notably, an inactive location is not \"broken\", and a location that has never synced is not unhealthy.
   * @summary Is ingestion working for this location
   * @param {ConnectionsSyncApiConnectionsSyncControllerGetSyncHealthV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsSyncControllerGetSyncHealthV1(
    requestParameters: ConnectionsSyncApiConnectionsSyncControllerGetSyncHealthV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<SyncHealthResponseDto>;

  /**
   * What makes \"why did this tenant never get review X\" answerable from the product rather than a shell on a production box. Both triggers appear in one feed on purpose: seeing the one-time `backfill` run beside the `scheduled` ones is how support confirms backfill actually ran, and a low `reviewsFetched` on it explains thin AI few-shot examples.
   * @summary Paginated sync-run history, newest first
   * @param {ConnectionsSyncApiConnectionsSyncControllerListSyncRunsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsSyncControllerListSyncRunsV1(
    requestParameters: ConnectionsSyncApiConnectionsSyncControllerListSyncRunsV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<SyncRunListResponseDto>;
}

/**
 * Request parameters for connectionsSyncControllerGetBackfillV1 operation in ConnectionsSyncApi.
 */
export interface ConnectionsSyncApiConnectionsSyncControllerGetBackfillV1Request {
  readonly locationId: string;
}

/**
 * Request parameters for connectionsSyncControllerGetSyncHealthV1 operation in ConnectionsSyncApi.
 */
export interface ConnectionsSyncApiConnectionsSyncControllerGetSyncHealthV1Request {
  readonly locationId: string;
}

/**
 * Request parameters for connectionsSyncControllerListSyncRunsV1 operation in ConnectionsSyncApi.
 */
export interface ConnectionsSyncApiConnectionsSyncControllerListSyncRunsV1Request {
  readonly locationId: string;

  readonly page?: number;

  readonly pageSize?: number;

  readonly status?: ConnectionsSyncControllerListSyncRunsV1StatusEnum;

  readonly trigger?: ConnectionsSyncControllerListSyncRunsV1TriggerEnum;
}

/**
 * ConnectionsSyncApi - object-oriented interface
 */
export class ConnectionsSyncApi
  extends BaseAPI
  implements ConnectionsSyncApiInterface
{
  /**
   * Polled by the onboarding backfilling stage. **Terminal is `livePollingEnabled`, not `status`** — `status: \"ok\"` means the import job finished, while `onboardingBackfillCompletedAt` is what un-gates the live poller. Advancing the UI on `status` alone shows the owner \"you\'re all set\" for a location the scheduler still refuses to enqueue. `progress` is null whenever `totalToImport` is null or zero — the client shows an indeterminate bar rather than a fabricated percentage. Throttled at 120/min because a 2-second poll dies on the global 30/min tier inside the first minute.
   * @summary Progress of the one-time historical import
   * @param {ConnectionsSyncApiConnectionsSyncControllerGetBackfillV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsSyncControllerGetBackfillV1(
    requestParameters: ConnectionsSyncApiConnectionsSyncControllerGetBackfillV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsSyncApiFp(this.configuration)
      .connectionsSyncControllerGetBackfillV1(
        requestParameters.locationId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Assembled from the three places that each hold part of the answer: the location\'s rolled-up `last_sync_*` snapshot, the connection\'s credential health, and any `sync_runs` row currently running. `healthy` encodes the combination so no caller re-derives it — notably, an inactive location is not \"broken\", and a location that has never synced is not unhealthy.
   * @summary Is ingestion working for this location
   * @param {ConnectionsSyncApiConnectionsSyncControllerGetSyncHealthV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsSyncControllerGetSyncHealthV1(
    requestParameters: ConnectionsSyncApiConnectionsSyncControllerGetSyncHealthV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsSyncApiFp(this.configuration)
      .connectionsSyncControllerGetSyncHealthV1(
        requestParameters.locationId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * What makes \"why did this tenant never get review X\" answerable from the product rather than a shell on a production box. Both triggers appear in one feed on purpose: seeing the one-time `backfill` run beside the `scheduled` ones is how support confirms backfill actually ran, and a low `reviewsFetched` on it explains thin AI few-shot examples.
   * @summary Paginated sync-run history, newest first
   * @param {ConnectionsSyncApiConnectionsSyncControllerListSyncRunsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsSyncControllerListSyncRunsV1(
    requestParameters: ConnectionsSyncApiConnectionsSyncControllerListSyncRunsV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsSyncApiFp(this.configuration)
      .connectionsSyncControllerListSyncRunsV1(
        requestParameters.locationId,
        requestParameters.page,
        requestParameters.pageSize,
        requestParameters.status,
        requestParameters.trigger,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}

export const ConnectionsSyncControllerListSyncRunsV1StatusEnum = {
  Running: 'running',
  Ok: 'ok',
  Error: 'error',
} as const;
export type ConnectionsSyncControllerListSyncRunsV1StatusEnum =
  (typeof ConnectionsSyncControllerListSyncRunsV1StatusEnum)[keyof typeof ConnectionsSyncControllerListSyncRunsV1StatusEnum];
export const ConnectionsSyncControllerListSyncRunsV1TriggerEnum = {
  Scheduled: 'scheduled',
  Backfill: 'backfill',
} as const;
export type ConnectionsSyncControllerListSyncRunsV1TriggerEnum =
  (typeof ConnectionsSyncControllerListSyncRunsV1TriggerEnum)[keyof typeof ConnectionsSyncControllerListSyncRunsV1TriggerEnum];
