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
import type { NotificationListResponseDto } from '../models';
// @ts-ignore
import type { NotificationReadResponseDto } from '../models';
/**
 * NotificationsApi - axios parameter creator
 */
export const NotificationsApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * The bell popover’s feed — the current user’s own in-app notifications, newest first. Scoped to the caller’s tenant *and* user id from the token; there is no way to read another user’s feed. `offset`/`limit`, not this app’s usual `page`/`pageSize` — matches the shipped frontend’s own `list(offset, limit)` call exactly. `unreadTotal` covers the whole feed, not just this page, so there is no separate unread-count route.
     * @summary List the caller’s notifications
     * @param {number} [offset] The count of items already loaded, not a page index.
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationsControllerListV1: async (
      offset?: number,
      limit?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/notifications`;
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

      if (offset !== undefined) {
        localVarQueryParameter['offset'] = offset;
      }

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
     * Stamps every unread notification in the caller’s own feed as read, never anyone else’s. Already-read rows keep their original timestamps. `unreadTotal` is read back from the database rather than assumed to be zero, so a notification that arrived mid-request is still counted.
     * @summary Mark the caller’s whole feed read
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationsControllerMarkAllReadV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/notifications/read-all`;
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
     * Stamps a single notification in the caller’s own feed as read. Scoped to the caller’s tenant *and* user id, so another user’s notification id answers 404 rather than being written. Idempotent: marking an already-read notification succeeds and leaves the original timestamp untouched, which is what lets the bell fire this on every click.
     * @summary Mark one notification read
     * @param {string} notificationId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationsControllerMarkReadV1: async (
      notificationId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'notificationId' is not null or undefined
      assertParamExists(
        'notificationsControllerMarkReadV1',
        'notificationId',
        notificationId,
      );
      const localVarPath = `/v1/notifications/{notificationId}/read`.replace(
        '{notificationId}',
        encodeURIComponent(String(notificationId)),
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
 * NotificationsApi - functional programming interface
 */
export const NotificationsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    NotificationsApiAxiosParamCreator(configuration);
  return {
    /**
     * The bell popover’s feed — the current user’s own in-app notifications, newest first. Scoped to the caller’s tenant *and* user id from the token; there is no way to read another user’s feed. `offset`/`limit`, not this app’s usual `page`/`pageSize` — matches the shipped frontend’s own `list(offset, limit)` call exactly. `unreadTotal` covers the whole feed, not just this page, so there is no separate unread-count route.
     * @summary List the caller’s notifications
     * @param {number} [offset] The count of items already loaded, not a page index.
     * @param {number} [limit]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async notificationsControllerListV1(
      offset?: number,
      limit?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<NotificationListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.notificationsControllerListV1(
          offset,
          limit,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['NotificationsApi.notificationsControllerListV1']?.[
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
     * Stamps every unread notification in the caller’s own feed as read, never anyone else’s. Already-read rows keep their original timestamps. `unreadTotal` is read back from the database rather than assumed to be zero, so a notification that arrived mid-request is still counted.
     * @summary Mark the caller’s whole feed read
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async notificationsControllerMarkAllReadV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<NotificationReadResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.notificationsControllerMarkAllReadV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'NotificationsApi.notificationsControllerMarkAllReadV1'
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
     * Stamps a single notification in the caller’s own feed as read. Scoped to the caller’s tenant *and* user id, so another user’s notification id answers 404 rather than being written. Idempotent: marking an already-read notification succeeds and leaves the original timestamp untouched, which is what lets the bell fire this on every click.
     * @summary Mark one notification read
     * @param {string} notificationId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async notificationsControllerMarkReadV1(
      notificationId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<NotificationReadResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.notificationsControllerMarkReadV1(
          notificationId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'NotificationsApi.notificationsControllerMarkReadV1'
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
 * NotificationsApi - factory interface
 */
export const NotificationsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = NotificationsApiFp(configuration);
  return {
    /**
     * The bell popover’s feed — the current user’s own in-app notifications, newest first. Scoped to the caller’s tenant *and* user id from the token; there is no way to read another user’s feed. `offset`/`limit`, not this app’s usual `page`/`pageSize` — matches the shipped frontend’s own `list(offset, limit)` call exactly. `unreadTotal` covers the whole feed, not just this page, so there is no separate unread-count route.
     * @summary List the caller’s notifications
     * @param {NotificationsApiNotificationsControllerListV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationsControllerListV1(
      requestParameters: NotificationsApiNotificationsControllerListV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<NotificationListResponseDto> {
      return localVarFp
        .notificationsControllerListV1(
          requestParameters.offset,
          requestParameters.limit,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Stamps every unread notification in the caller’s own feed as read, never anyone else’s. Already-read rows keep their original timestamps. `unreadTotal` is read back from the database rather than assumed to be zero, so a notification that arrived mid-request is still counted.
     * @summary Mark the caller’s whole feed read
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationsControllerMarkAllReadV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<NotificationReadResponseDto> {
      return localVarFp
        .notificationsControllerMarkAllReadV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Stamps a single notification in the caller’s own feed as read. Scoped to the caller’s tenant *and* user id, so another user’s notification id answers 404 rather than being written. Idempotent: marking an already-read notification succeeds and leaves the original timestamp untouched, which is what lets the bell fire this on every click.
     * @summary Mark one notification read
     * @param {NotificationsApiNotificationsControllerMarkReadV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationsControllerMarkReadV1(
      requestParameters: NotificationsApiNotificationsControllerMarkReadV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<NotificationReadResponseDto> {
      return localVarFp
        .notificationsControllerMarkReadV1(
          requestParameters.notificationId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * NotificationsApi - interface
 */
export interface NotificationsApiInterface {
  /**
   * The bell popover’s feed — the current user’s own in-app notifications, newest first. Scoped to the caller’s tenant *and* user id from the token; there is no way to read another user’s feed. `offset`/`limit`, not this app’s usual `page`/`pageSize` — matches the shipped frontend’s own `list(offset, limit)` call exactly. `unreadTotal` covers the whole feed, not just this page, so there is no separate unread-count route.
   * @summary List the caller’s notifications
   * @param {NotificationsApiNotificationsControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  notificationsControllerListV1(
    requestParameters?: NotificationsApiNotificationsControllerListV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<NotificationListResponseDto>;

  /**
   * Stamps every unread notification in the caller’s own feed as read, never anyone else’s. Already-read rows keep their original timestamps. `unreadTotal` is read back from the database rather than assumed to be zero, so a notification that arrived mid-request is still counted.
   * @summary Mark the caller’s whole feed read
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  notificationsControllerMarkAllReadV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<NotificationReadResponseDto>;

  /**
   * Stamps a single notification in the caller’s own feed as read. Scoped to the caller’s tenant *and* user id, so another user’s notification id answers 404 rather than being written. Idempotent: marking an already-read notification succeeds and leaves the original timestamp untouched, which is what lets the bell fire this on every click.
   * @summary Mark one notification read
   * @param {NotificationsApiNotificationsControllerMarkReadV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  notificationsControllerMarkReadV1(
    requestParameters: NotificationsApiNotificationsControllerMarkReadV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<NotificationReadResponseDto>;
}

/**
 * Request parameters for notificationsControllerListV1 operation in NotificationsApi.
 */
export interface NotificationsApiNotificationsControllerListV1Request {
  /**
   * The count of items already loaded, not a page index.
   */
  readonly offset?: number;

  readonly limit?: number;
}

/**
 * Request parameters for notificationsControllerMarkReadV1 operation in NotificationsApi.
 */
export interface NotificationsApiNotificationsControllerMarkReadV1Request {
  readonly notificationId: string;
}

/**
 * NotificationsApi - object-oriented interface
 */
export class NotificationsApi
  extends BaseAPI
  implements NotificationsApiInterface
{
  /**
   * The bell popover’s feed — the current user’s own in-app notifications, newest first. Scoped to the caller’s tenant *and* user id from the token; there is no way to read another user’s feed. `offset`/`limit`, not this app’s usual `page`/`pageSize` — matches the shipped frontend’s own `list(offset, limit)` call exactly. `unreadTotal` covers the whole feed, not just this page, so there is no separate unread-count route.
   * @summary List the caller’s notifications
   * @param {NotificationsApiNotificationsControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public notificationsControllerListV1(
    requestParameters: NotificationsApiNotificationsControllerListV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return NotificationsApiFp(this.configuration)
      .notificationsControllerListV1(
        requestParameters.offset,
        requestParameters.limit,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Stamps every unread notification in the caller’s own feed as read, never anyone else’s. Already-read rows keep their original timestamps. `unreadTotal` is read back from the database rather than assumed to be zero, so a notification that arrived mid-request is still counted.
   * @summary Mark the caller’s whole feed read
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public notificationsControllerMarkAllReadV1(options?: RawAxiosRequestConfig) {
    return NotificationsApiFp(this.configuration)
      .notificationsControllerMarkAllReadV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Stamps a single notification in the caller’s own feed as read. Scoped to the caller’s tenant *and* user id, so another user’s notification id answers 404 rather than being written. Idempotent: marking an already-read notification succeeds and leaves the original timestamp untouched, which is what lets the bell fire this on every click.
   * @summary Mark one notification read
   * @param {NotificationsApiNotificationsControllerMarkReadV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public notificationsControllerMarkReadV1(
    requestParameters: NotificationsApiNotificationsControllerMarkReadV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return NotificationsApiFp(this.configuration)
      .notificationsControllerMarkReadV1(
        requestParameters.notificationId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
