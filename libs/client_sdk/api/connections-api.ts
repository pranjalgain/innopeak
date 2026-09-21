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
import type { AvailableLocationsResponseDto } from '../models';
// @ts-ignore
import type { ConfirmLocationDto } from '../models';
// @ts-ignore
import type { ConfirmLocationsResponseDto } from '../models';
// @ts-ignore
import type { ConnectionStatusResponseDto } from '../models';
// @ts-ignore
import type { DisconnectResponseDto } from '../models';
// @ts-ignore
import type { LocationDto } from '../models';
// @ts-ignore
import type { LocationListResponseDto } from '../models';
// @ts-ignore
import type { SetActiveLocationDto } from '../models';
/**
 * ConnectionsApi - axios parameter creator
 */
export const ConnectionsApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Entered as a top-level browser navigation, so tenant context cannot ride in a body — it is read off the session and bound to a signed, single-use `state` plus a browser-binding cookie. This is also the reconnect route: recovery from `needs_reauth` is the same round trip and the same upsert, so there is no separate /reauth endpoint to keep in sync.
     * @summary Start the Google Business Profile grant (302 to consent)
     * @param {ConnectionsControllerAuthorizeV1ReturnToEnum} [returnTo] Allowlist key, never a URL — a raw URL here would be an open redirect.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerAuthorizeV1: async (
      returnTo?: ConnectionsControllerAuthorizeV1ReturnToEnum,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/connections/google/authorize`;
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

      if (returnTo !== undefined) {
        localVarQueryParameter['returnTo'] = returnTo;
      }

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
     * A live call, not a database read — nothing is persisted until the owner confirms one, so calling it twice is free and calling it after a reconnect reflects locations added or removed on Google\'s side. Also the first place a stale grant surfaces interactively: a 401/403 from Google sets `needs_reauth` before answering 409.
     * @summary Locations the granted Google account can see (live provider call)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerAvailableLocationsV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/connections/google/available-locations`;
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
     * Public because Google, not the SPA, makes this request and it carries no bearer token. All tenant context comes from `state`, which is verified and consumed **before** `code` is exchanged or anything is written. Every outcome is a 302 with `?connected=1` or `?error=<CODE>` — never JSON, since the user is mid-browser-navigation. Error codes: INVALID_STATE, ACCESS_DENIED, PROVIDER_ERROR, ACCOUNT_MISMATCH, INSUFFICIENT_SCOPE.
     * @summary Google OAuth callback (public — Google performs this request)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerCallbackV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/connections/google/callback`;
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
     * One transaction across three tables, looped once per confirmed location: upsert `locations`, insert `user_locations`, acquire the backfill `sync_runs` row. Each job is enqueued only after that transaction commits — BullMQ and Postgres share no transaction. Idempotent per location: a double-submitted confirm still answers 201 with `backfillAlreadyRunning: true` and the existing run for that location, rather than a 409 that would leave the client with no id to poll. If an enqueue itself fails (a Redis/BullMQ blip after the transaction already committed), that location\'s sync run is immediately compensated to `error` rather than left stuck `running` forever, and this request answers 503 — every location up to that point is confirmed, but the caller must confirm again to start a fresh import for the ones that failed to enqueue.
     * @summary Confirm the managed locations and start each historical backfill
     * @param {ConfirmLocationDto} confirmLocationDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerConfirmLocationV1: async (
      confirmLocationDto: ConfirmLocationDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'confirmLocationDto' is not null or undefined
      assertParamExists(
        'connectionsControllerConfirmLocationV1',
        'confirmLocationDto',
        confirmLocationDto,
      );
      const localVarPath = `/v1/connections/locations`;
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
        confirmLocationDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * The destructive-looking action that destroys nothing. Flips every location to `inactive` and revokes the stored credential; never DELETEs. `locations` cascades from the connection and `reviews`/`sync_runs` cascade from locations, so a delete would take the tenant\'s entire review history with it.
     * @summary Disconnect Google Business Profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerDisconnectV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/connections/google`;
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
     * The connection row, the location it resolved to, and that location\'s sync snapshot — so a guard can answer \"is this tenant set up?\" without three requests. A tenant with no connection is a 200 with `connected: false`, never a 404: not-connected-yet is the normal state of every tenant between signup and onboarding.
     * @summary The tenant\'s whole connection picture in one call
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerGetConnectionV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/connections`;
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
     * Joined through `user_locations` rather than filtered on `locations.tenant_id` alone — identical results today, already correct on the day a member is scoped to one store of several. Returns inactive locations too, so a disconnected tenant\'s history stays addressable.
     * @summary The tenant\'s persisted locations
     * @param {ConnectionsControllerListLocationsV1StatusEnum} [status]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerListLocationsV1: async (
      status?: ConnectionsControllerListLocationsV1StatusEnum,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/connections/locations`;
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

      if (status !== undefined) {
        localVarQueryParameter['status'] = status;
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
     * A single shared value for the whole tenant, not per-user — every member\'s Dashboard/Review Queue reads it, so only an owner may change it. The location must belong to this tenant and be active; a deactivated location or another tenant\'s id is rejected.
     * @summary Switch the tenant\'s currently-viewed business
     * @param {SetActiveLocationDto} setActiveLocationDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerSetActiveLocationV1: async (
      setActiveLocationDto: SetActiveLocationDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'setActiveLocationDto' is not null or undefined
      assertParamExists(
        'connectionsControllerSetActiveLocationV1',
        'setActiveLocationDto',
        setActiveLocationDto,
      );
      const localVarPath = `/v1/connections/active-location`;
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
        setActiveLocationDto,
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
 * ConnectionsApi - functional programming interface
 */
export const ConnectionsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    ConnectionsApiAxiosParamCreator(configuration);
  return {
    /**
     * Entered as a top-level browser navigation, so tenant context cannot ride in a body — it is read off the session and bound to a signed, single-use `state` plus a browser-binding cookie. This is also the reconnect route: recovery from `needs_reauth` is the same round trip and the same upsert, so there is no separate /reauth endpoint to keep in sync.
     * @summary Start the Google Business Profile grant (302 to consent)
     * @param {ConnectionsControllerAuthorizeV1ReturnToEnum} [returnTo] Allowlist key, never a URL — a raw URL here would be an open redirect.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerAuthorizeV1(
      returnTo?: ConnectionsControllerAuthorizeV1ReturnToEnum,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerAuthorizeV1(
          returnTo,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['ConnectionsApi.connectionsControllerAuthorizeV1']?.[
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
     * A live call, not a database read — nothing is persisted until the owner confirms one, so calling it twice is free and calling it after a reconnect reflects locations added or removed on Google\'s side. Also the first place a stale grant surfaces interactively: a 401/403 from Google sets `needs_reauth` before answering 409.
     * @summary Locations the granted Google account can see (live provider call)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerAvailableLocationsV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AvailableLocationsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerAvailableLocationsV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsApi.connectionsControllerAvailableLocationsV1'
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
     * Public because Google, not the SPA, makes this request and it carries no bearer token. All tenant context comes from `state`, which is verified and consumed **before** `code` is exchanged or anything is written. Every outcome is a 302 with `?connected=1` or `?error=<CODE>` — never JSON, since the user is mid-browser-navigation. Error codes: INVALID_STATE, ACCESS_DENIED, PROVIDER_ERROR, ACCOUNT_MISMATCH, INSUFFICIENT_SCOPE.
     * @summary Google OAuth callback (public — Google performs this request)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerCallbackV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerCallbackV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['ConnectionsApi.connectionsControllerCallbackV1']?.[
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
     * One transaction across three tables, looped once per confirmed location: upsert `locations`, insert `user_locations`, acquire the backfill `sync_runs` row. Each job is enqueued only after that transaction commits — BullMQ and Postgres share no transaction. Idempotent per location: a double-submitted confirm still answers 201 with `backfillAlreadyRunning: true` and the existing run for that location, rather than a 409 that would leave the client with no id to poll. If an enqueue itself fails (a Redis/BullMQ blip after the transaction already committed), that location\'s sync run is immediately compensated to `error` rather than left stuck `running` forever, and this request answers 503 — every location up to that point is confirmed, but the caller must confirm again to start a fresh import for the ones that failed to enqueue.
     * @summary Confirm the managed locations and start each historical backfill
     * @param {ConfirmLocationDto} confirmLocationDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerConfirmLocationV1(
      confirmLocationDto: ConfirmLocationDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ConfirmLocationsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerConfirmLocationV1(
          confirmLocationDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsApi.connectionsControllerConfirmLocationV1'
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
     * The destructive-looking action that destroys nothing. Flips every location to `inactive` and revokes the stored credential; never DELETEs. `locations` cascades from the connection and `reviews`/`sync_runs` cascade from locations, so a delete would take the tenant\'s entire review history with it.
     * @summary Disconnect Google Business Profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerDisconnectV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<DisconnectResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerDisconnectV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsApi.connectionsControllerDisconnectV1'
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
     * The connection row, the location it resolved to, and that location\'s sync snapshot — so a guard can answer \"is this tenant set up?\" without three requests. A tenant with no connection is a 200 with `connected: false`, never a 404: not-connected-yet is the normal state of every tenant between signup and onboarding.
     * @summary The tenant\'s whole connection picture in one call
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerGetConnectionV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ConnectionStatusResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerGetConnectionV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsApi.connectionsControllerGetConnectionV1'
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
     * Joined through `user_locations` rather than filtered on `locations.tenant_id` alone — identical results today, already correct on the day a member is scoped to one store of several. Returns inactive locations too, so a disconnected tenant\'s history stays addressable.
     * @summary The tenant\'s persisted locations
     * @param {ConnectionsControllerListLocationsV1StatusEnum} [status]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerListLocationsV1(
      status?: ConnectionsControllerListLocationsV1StatusEnum,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<LocationListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerListLocationsV1(
          status,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsApi.connectionsControllerListLocationsV1'
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
     * A single shared value for the whole tenant, not per-user — every member\'s Dashboard/Review Queue reads it, so only an owner may change it. The location must belong to this tenant and be active; a deactivated location or another tenant\'s id is rejected.
     * @summary Switch the tenant\'s currently-viewed business
     * @param {SetActiveLocationDto} setActiveLocationDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async connectionsControllerSetActiveLocationV1(
      setActiveLocationDto: SetActiveLocationDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<LocationDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.connectionsControllerSetActiveLocationV1(
          setActiveLocationDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'ConnectionsApi.connectionsControllerSetActiveLocationV1'
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
 * ConnectionsApi - factory interface
 */
export const ConnectionsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = ConnectionsApiFp(configuration);
  return {
    /**
     * Entered as a top-level browser navigation, so tenant context cannot ride in a body — it is read off the session and bound to a signed, single-use `state` plus a browser-binding cookie. This is also the reconnect route: recovery from `needs_reauth` is the same round trip and the same upsert, so there is no separate /reauth endpoint to keep in sync.
     * @summary Start the Google Business Profile grant (302 to consent)
     * @param {ConnectionsApiConnectionsControllerAuthorizeV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerAuthorizeV1(
      requestParameters: ConnectionsApiConnectionsControllerAuthorizeV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .connectionsControllerAuthorizeV1(requestParameters.returnTo, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * A live call, not a database read — nothing is persisted until the owner confirms one, so calling it twice is free and calling it after a reconnect reflects locations added or removed on Google\'s side. Also the first place a stale grant surfaces interactively: a 401/403 from Google sets `needs_reauth` before answering 409.
     * @summary Locations the granted Google account can see (live provider call)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerAvailableLocationsV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AvailableLocationsResponseDto> {
      return localVarFp
        .connectionsControllerAvailableLocationsV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Public because Google, not the SPA, makes this request and it carries no bearer token. All tenant context comes from `state`, which is verified and consumed **before** `code` is exchanged or anything is written. Every outcome is a 302 with `?connected=1` or `?error=<CODE>` — never JSON, since the user is mid-browser-navigation. Error codes: INVALID_STATE, ACCESS_DENIED, PROVIDER_ERROR, ACCOUNT_MISMATCH, INSUFFICIENT_SCOPE.
     * @summary Google OAuth callback (public — Google performs this request)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerCallbackV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .connectionsControllerCallbackV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * One transaction across three tables, looped once per confirmed location: upsert `locations`, insert `user_locations`, acquire the backfill `sync_runs` row. Each job is enqueued only after that transaction commits — BullMQ and Postgres share no transaction. Idempotent per location: a double-submitted confirm still answers 201 with `backfillAlreadyRunning: true` and the existing run for that location, rather than a 409 that would leave the client with no id to poll. If an enqueue itself fails (a Redis/BullMQ blip after the transaction already committed), that location\'s sync run is immediately compensated to `error` rather than left stuck `running` forever, and this request answers 503 — every location up to that point is confirmed, but the caller must confirm again to start a fresh import for the ones that failed to enqueue.
     * @summary Confirm the managed locations and start each historical backfill
     * @param {ConnectionsApiConnectionsControllerConfirmLocationV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerConfirmLocationV1(
      requestParameters: ConnectionsApiConnectionsControllerConfirmLocationV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ConfirmLocationsResponseDto> {
      return localVarFp
        .connectionsControllerConfirmLocationV1(
          requestParameters.confirmLocationDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * The destructive-looking action that destroys nothing. Flips every location to `inactive` and revokes the stored credential; never DELETEs. `locations` cascades from the connection and `reviews`/`sync_runs` cascade from locations, so a delete would take the tenant\'s entire review history with it.
     * @summary Disconnect Google Business Profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerDisconnectV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<DisconnectResponseDto> {
      return localVarFp
        .connectionsControllerDisconnectV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The connection row, the location it resolved to, and that location\'s sync snapshot — so a guard can answer \"is this tenant set up?\" without three requests. A tenant with no connection is a 200 with `connected: false`, never a 404: not-connected-yet is the normal state of every tenant between signup and onboarding.
     * @summary The tenant\'s whole connection picture in one call
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerGetConnectionV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ConnectionStatusResponseDto> {
      return localVarFp
        .connectionsControllerGetConnectionV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Joined through `user_locations` rather than filtered on `locations.tenant_id` alone — identical results today, already correct on the day a member is scoped to one store of several. Returns inactive locations too, so a disconnected tenant\'s history stays addressable.
     * @summary The tenant\'s persisted locations
     * @param {ConnectionsApiConnectionsControllerListLocationsV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerListLocationsV1(
      requestParameters: ConnectionsApiConnectionsControllerListLocationsV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<LocationListResponseDto> {
      return localVarFp
        .connectionsControllerListLocationsV1(requestParameters.status, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * A single shared value for the whole tenant, not per-user — every member\'s Dashboard/Review Queue reads it, so only an owner may change it. The location must belong to this tenant and be active; a deactivated location or another tenant\'s id is rejected.
     * @summary Switch the tenant\'s currently-viewed business
     * @param {ConnectionsApiConnectionsControllerSetActiveLocationV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    connectionsControllerSetActiveLocationV1(
      requestParameters: ConnectionsApiConnectionsControllerSetActiveLocationV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<LocationDto> {
      return localVarFp
        .connectionsControllerSetActiveLocationV1(
          requestParameters.setActiveLocationDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * ConnectionsApi - interface
 */
export interface ConnectionsApiInterface {
  /**
   * Entered as a top-level browser navigation, so tenant context cannot ride in a body — it is read off the session and bound to a signed, single-use `state` plus a browser-binding cookie. This is also the reconnect route: recovery from `needs_reauth` is the same round trip and the same upsert, so there is no separate /reauth endpoint to keep in sync.
   * @summary Start the Google Business Profile grant (302 to consent)
   * @param {ConnectionsApiConnectionsControllerAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerAuthorizeV1(
    requestParameters?: ConnectionsApiConnectionsControllerAuthorizeV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * A live call, not a database read — nothing is persisted until the owner confirms one, so calling it twice is free and calling it after a reconnect reflects locations added or removed on Google\'s side. Also the first place a stale grant surfaces interactively: a 401/403 from Google sets `needs_reauth` before answering 409.
   * @summary Locations the granted Google account can see (live provider call)
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerAvailableLocationsV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AvailableLocationsResponseDto>;

  /**
   * Public because Google, not the SPA, makes this request and it carries no bearer token. All tenant context comes from `state`, which is verified and consumed **before** `code` is exchanged or anything is written. Every outcome is a 302 with `?connected=1` or `?error=<CODE>` — never JSON, since the user is mid-browser-navigation. Error codes: INVALID_STATE, ACCESS_DENIED, PROVIDER_ERROR, ACCOUNT_MISMATCH, INSUFFICIENT_SCOPE.
   * @summary Google OAuth callback (public — Google performs this request)
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerCallbackV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * One transaction across three tables, looped once per confirmed location: upsert `locations`, insert `user_locations`, acquire the backfill `sync_runs` row. Each job is enqueued only after that transaction commits — BullMQ and Postgres share no transaction. Idempotent per location: a double-submitted confirm still answers 201 with `backfillAlreadyRunning: true` and the existing run for that location, rather than a 409 that would leave the client with no id to poll. If an enqueue itself fails (a Redis/BullMQ blip after the transaction already committed), that location\'s sync run is immediately compensated to `error` rather than left stuck `running` forever, and this request answers 503 — every location up to that point is confirmed, but the caller must confirm again to start a fresh import for the ones that failed to enqueue.
   * @summary Confirm the managed locations and start each historical backfill
   * @param {ConnectionsApiConnectionsControllerConfirmLocationV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerConfirmLocationV1(
    requestParameters: ConnectionsApiConnectionsControllerConfirmLocationV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ConfirmLocationsResponseDto>;

  /**
   * The destructive-looking action that destroys nothing. Flips every location to `inactive` and revokes the stored credential; never DELETEs. `locations` cascades from the connection and `reviews`/`sync_runs` cascade from locations, so a delete would take the tenant\'s entire review history with it.
   * @summary Disconnect Google Business Profile
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerDisconnectV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<DisconnectResponseDto>;

  /**
   * The connection row, the location it resolved to, and that location\'s sync snapshot — so a guard can answer \"is this tenant set up?\" without three requests. A tenant with no connection is a 200 with `connected: false`, never a 404: not-connected-yet is the normal state of every tenant between signup and onboarding.
   * @summary The tenant\'s whole connection picture in one call
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerGetConnectionV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ConnectionStatusResponseDto>;

  /**
   * Joined through `user_locations` rather than filtered on `locations.tenant_id` alone — identical results today, already correct on the day a member is scoped to one store of several. Returns inactive locations too, so a disconnected tenant\'s history stays addressable.
   * @summary The tenant\'s persisted locations
   * @param {ConnectionsApiConnectionsControllerListLocationsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerListLocationsV1(
    requestParameters?: ConnectionsApiConnectionsControllerListLocationsV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<LocationListResponseDto>;

  /**
   * A single shared value for the whole tenant, not per-user — every member\'s Dashboard/Review Queue reads it, so only an owner may change it. The location must belong to this tenant and be active; a deactivated location or another tenant\'s id is rejected.
   * @summary Switch the tenant\'s currently-viewed business
   * @param {ConnectionsApiConnectionsControllerSetActiveLocationV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  connectionsControllerSetActiveLocationV1(
    requestParameters: ConnectionsApiConnectionsControllerSetActiveLocationV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<LocationDto>;
}

/**
 * Request parameters for connectionsControllerAuthorizeV1 operation in ConnectionsApi.
 */
export interface ConnectionsApiConnectionsControllerAuthorizeV1Request {
  /**
   * Allowlist key, never a URL — a raw URL here would be an open redirect.
   */
  readonly returnTo?: ConnectionsControllerAuthorizeV1ReturnToEnum;
}

/**
 * Request parameters for connectionsControllerConfirmLocationV1 operation in ConnectionsApi.
 */
export interface ConnectionsApiConnectionsControllerConfirmLocationV1Request {
  readonly confirmLocationDto: ConfirmLocationDto;
}

/**
 * Request parameters for connectionsControllerListLocationsV1 operation in ConnectionsApi.
 */
export interface ConnectionsApiConnectionsControllerListLocationsV1Request {
  readonly status?: ConnectionsControllerListLocationsV1StatusEnum;
}

/**
 * Request parameters for connectionsControllerSetActiveLocationV1 operation in ConnectionsApi.
 */
export interface ConnectionsApiConnectionsControllerSetActiveLocationV1Request {
  readonly setActiveLocationDto: SetActiveLocationDto;
}

/**
 * ConnectionsApi - object-oriented interface
 */
export class ConnectionsApi extends BaseAPI implements ConnectionsApiInterface {
  /**
   * Entered as a top-level browser navigation, so tenant context cannot ride in a body — it is read off the session and bound to a signed, single-use `state` plus a browser-binding cookie. This is also the reconnect route: recovery from `needs_reauth` is the same round trip and the same upsert, so there is no separate /reauth endpoint to keep in sync.
   * @summary Start the Google Business Profile grant (302 to consent)
   * @param {ConnectionsApiConnectionsControllerAuthorizeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerAuthorizeV1(
    requestParameters: ConnectionsApiConnectionsControllerAuthorizeV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerAuthorizeV1(requestParameters.returnTo, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * A live call, not a database read — nothing is persisted until the owner confirms one, so calling it twice is free and calling it after a reconnect reflects locations added or removed on Google\'s side. Also the first place a stale grant surfaces interactively: a 401/403 from Google sets `needs_reauth` before answering 409.
   * @summary Locations the granted Google account can see (live provider call)
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerAvailableLocationsV1(
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerAvailableLocationsV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Public because Google, not the SPA, makes this request and it carries no bearer token. All tenant context comes from `state`, which is verified and consumed **before** `code` is exchanged or anything is written. Every outcome is a 302 with `?connected=1` or `?error=<CODE>` — never JSON, since the user is mid-browser-navigation. Error codes: INVALID_STATE, ACCESS_DENIED, PROVIDER_ERROR, ACCOUNT_MISMATCH, INSUFFICIENT_SCOPE.
   * @summary Google OAuth callback (public — Google performs this request)
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerCallbackV1(options?: RawAxiosRequestConfig) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerCallbackV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * One transaction across three tables, looped once per confirmed location: upsert `locations`, insert `user_locations`, acquire the backfill `sync_runs` row. Each job is enqueued only after that transaction commits — BullMQ and Postgres share no transaction. Idempotent per location: a double-submitted confirm still answers 201 with `backfillAlreadyRunning: true` and the existing run for that location, rather than a 409 that would leave the client with no id to poll. If an enqueue itself fails (a Redis/BullMQ blip after the transaction already committed), that location\'s sync run is immediately compensated to `error` rather than left stuck `running` forever, and this request answers 503 — every location up to that point is confirmed, but the caller must confirm again to start a fresh import for the ones that failed to enqueue.
   * @summary Confirm the managed locations and start each historical backfill
   * @param {ConnectionsApiConnectionsControllerConfirmLocationV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerConfirmLocationV1(
    requestParameters: ConnectionsApiConnectionsControllerConfirmLocationV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerConfirmLocationV1(
        requestParameters.confirmLocationDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The destructive-looking action that destroys nothing. Flips every location to `inactive` and revokes the stored credential; never DELETEs. `locations` cascades from the connection and `reviews`/`sync_runs` cascade from locations, so a delete would take the tenant\'s entire review history with it.
   * @summary Disconnect Google Business Profile
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerDisconnectV1(options?: RawAxiosRequestConfig) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerDisconnectV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The connection row, the location it resolved to, and that location\'s sync snapshot — so a guard can answer \"is this tenant set up?\" without three requests. A tenant with no connection is a 200 with `connected: false`, never a 404: not-connected-yet is the normal state of every tenant between signup and onboarding.
   * @summary The tenant\'s whole connection picture in one call
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerGetConnectionV1(options?: RawAxiosRequestConfig) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerGetConnectionV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Joined through `user_locations` rather than filtered on `locations.tenant_id` alone — identical results today, already correct on the day a member is scoped to one store of several. Returns inactive locations too, so a disconnected tenant\'s history stays addressable.
   * @summary The tenant\'s persisted locations
   * @param {ConnectionsApiConnectionsControllerListLocationsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerListLocationsV1(
    requestParameters: ConnectionsApiConnectionsControllerListLocationsV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerListLocationsV1(requestParameters.status, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * A single shared value for the whole tenant, not per-user — every member\'s Dashboard/Review Queue reads it, so only an owner may change it. The location must belong to this tenant and be active; a deactivated location or another tenant\'s id is rejected.
   * @summary Switch the tenant\'s currently-viewed business
   * @param {ConnectionsApiConnectionsControllerSetActiveLocationV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public connectionsControllerSetActiveLocationV1(
    requestParameters: ConnectionsApiConnectionsControllerSetActiveLocationV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ConnectionsApiFp(this.configuration)
      .connectionsControllerSetActiveLocationV1(
        requestParameters.setActiveLocationDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}

export const ConnectionsControllerAuthorizeV1ReturnToEnum = {
  Onboarding: 'onboarding',
  Settings: 'settings',
} as const;
export type ConnectionsControllerAuthorizeV1ReturnToEnum =
  (typeof ConnectionsControllerAuthorizeV1ReturnToEnum)[keyof typeof ConnectionsControllerAuthorizeV1ReturnToEnum];
export const ConnectionsControllerListLocationsV1StatusEnum = {
  Active: 'active',
  Inactive: 'inactive',
} as const;
export type ConnectionsControllerListLocationsV1StatusEnum =
  (typeof ConnectionsControllerListLocationsV1StatusEnum)[keyof typeof ConnectionsControllerListLocationsV1StatusEnum];
