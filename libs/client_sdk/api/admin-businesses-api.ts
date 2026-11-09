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
import type { AdminBusinessListResponseDto } from '../models';
// @ts-ignore
import type { AdminBusinessResponseDto } from '../models';
// @ts-ignore
import type { UpdateBusinessStatusDto } from '../models';
/**
 * AdminBusinessesApi - axios parameter creator
 */
export const AdminBusinessesApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Restores the tenant to active and clears the pending marker — a clean, full undo, since nothing is anonymized until the grace period actually elapses.
     * @summary Cancel a pending tenant erasure
     * @param {string} tenantId The tenant to restore
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerCancelErasureV1: async (
      tenantId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'tenantId' is not null or undefined
      assertParamExists(
        'adminBusinessesControllerCancelErasureV1',
        'tenantId',
        tenantId,
      );
      const localVarPath =
        `/v1/admin/businesses/{tenantId}/cancel-erasure`.replace(
          '{tenantId}',
          encodeURIComponent(String(tenantId)),
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
    /**
     * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection. `search` is applied server-side (tenant name or owner name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
     * @summary List every tenant, as a Super Admin \"business\"
     * @param {string} [search] Case-insensitive substring match against the tenant name or its owner name.
     * @param {number} [page] 1-based page number.
     * @param {number} [pageSize]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerListV1: async (
      search?: string,
      page?: number,
      pageSize?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/businesses`;
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
     * Platform-admin only (support/legal request) — never tenant-owner self-service. Suspends the tenant immediately, so every user in it loses access now; the actual anonymization of every user runs later, in a nightly job, once `ERASURE_GRACE_PERIOD_DAYS` has elapsed. Reviews, replies, locations, connections, and billing records are never touched — no PII lives in them once every user is anonymized. Cancellable any time before the grace period elapses. Asking again while an admin request is already pending changes nothing: the response is the same, but no second activity entry or owner email is produced and the grace period is not restarted.
     * @summary Request erasure of a whole tenant
     * @param {string} tenantId The tenant to erase
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerRequestErasureV1: async (
      tenantId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'tenantId' is not null or undefined
      assertParamExists(
        'adminBusinessesControllerRequestErasureV1',
        'tenantId',
        tenantId,
      );
      const localVarPath =
        `/v1/admin/businesses/{tenantId}/request-erasure`.replace(
          '{tenantId}',
          encodeURIComponent(String(tenantId)),
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
    /**
     * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`. Setting the status a tenant already has is a no-op: same response, no activity entry.
     * @summary Suspend or reactivate a tenant
     * @param {string} tenantId
     * @param {UpdateBusinessStatusDto} updateBusinessStatusDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerUpdateStatusV1: async (
      tenantId: string,
      updateBusinessStatusDto: UpdateBusinessStatusDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'tenantId' is not null or undefined
      assertParamExists(
        'adminBusinessesControllerUpdateStatusV1',
        'tenantId',
        tenantId,
      );
      // verify required parameter 'updateBusinessStatusDto' is not null or undefined
      assertParamExists(
        'adminBusinessesControllerUpdateStatusV1',
        'updateBusinessStatusDto',
        updateBusinessStatusDto,
      );
      const localVarPath = `/v1/admin/businesses/{tenantId}/status`.replace(
        '{tenantId}',
        encodeURIComponent(String(tenantId)),
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
        updateBusinessStatusDto,
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
 * AdminBusinessesApi - functional programming interface
 */
export const AdminBusinessesApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminBusinessesApiAxiosParamCreator(configuration);
  return {
    /**
     * Restores the tenant to active and clears the pending marker — a clean, full undo, since nothing is anonymized until the grace period actually elapses.
     * @summary Cancel a pending tenant erasure
     * @param {string} tenantId The tenant to restore
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBusinessesControllerCancelErasureV1(
      tenantId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminBusinessResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBusinessesControllerCancelErasureV1(
          tenantId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBusinessesApi.adminBusinessesControllerCancelErasureV1'
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
     * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection. `search` is applied server-side (tenant name or owner name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
     * @summary List every tenant, as a Super Admin \"business\"
     * @param {string} [search] Case-insensitive substring match against the tenant name or its owner name.
     * @param {number} [page] 1-based page number.
     * @param {number} [pageSize]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBusinessesControllerListV1(
      search?: string,
      page?: number,
      pageSize?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminBusinessListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBusinessesControllerListV1(
          search,
          page,
          pageSize,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBusinessesApi.adminBusinessesControllerListV1'
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
     * Platform-admin only (support/legal request) — never tenant-owner self-service. Suspends the tenant immediately, so every user in it loses access now; the actual anonymization of every user runs later, in a nightly job, once `ERASURE_GRACE_PERIOD_DAYS` has elapsed. Reviews, replies, locations, connections, and billing records are never touched — no PII lives in them once every user is anonymized. Cancellable any time before the grace period elapses. Asking again while an admin request is already pending changes nothing: the response is the same, but no second activity entry or owner email is produced and the grace period is not restarted.
     * @summary Request erasure of a whole tenant
     * @param {string} tenantId The tenant to erase
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBusinessesControllerRequestErasureV1(
      tenantId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminBusinessResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBusinessesControllerRequestErasureV1(
          tenantId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBusinessesApi.adminBusinessesControllerRequestErasureV1'
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
     * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`. Setting the status a tenant already has is a no-op: same response, no activity entry.
     * @summary Suspend or reactivate a tenant
     * @param {string} tenantId
     * @param {UpdateBusinessStatusDto} updateBusinessStatusDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBusinessesControllerUpdateStatusV1(
      tenantId: string,
      updateBusinessStatusDto: UpdateBusinessStatusDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminBusinessResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBusinessesControllerUpdateStatusV1(
          tenantId,
          updateBusinessStatusDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBusinessesApi.adminBusinessesControllerUpdateStatusV1'
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
 * AdminBusinessesApi - factory interface
 */
export const AdminBusinessesApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AdminBusinessesApiFp(configuration);
  return {
    /**
     * Restores the tenant to active and clears the pending marker — a clean, full undo, since nothing is anonymized until the grace period actually elapses.
     * @summary Cancel a pending tenant erasure
     * @param {AdminBusinessesApiAdminBusinessesControllerCancelErasureV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerCancelErasureV1(
      requestParameters: AdminBusinessesApiAdminBusinessesControllerCancelErasureV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminBusinessResponseDto> {
      return localVarFp
        .adminBusinessesControllerCancelErasureV1(
          requestParameters.tenantId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection. `search` is applied server-side (tenant name or owner name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
     * @summary List every tenant, as a Super Admin \"business\"
     * @param {AdminBusinessesApiAdminBusinessesControllerListV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerListV1(
      requestParameters: AdminBusinessesApiAdminBusinessesControllerListV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminBusinessListResponseDto> {
      return localVarFp
        .adminBusinessesControllerListV1(
          requestParameters.search,
          requestParameters.page,
          requestParameters.pageSize,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Platform-admin only (support/legal request) — never tenant-owner self-service. Suspends the tenant immediately, so every user in it loses access now; the actual anonymization of every user runs later, in a nightly job, once `ERASURE_GRACE_PERIOD_DAYS` has elapsed. Reviews, replies, locations, connections, and billing records are never touched — no PII lives in them once every user is anonymized. Cancellable any time before the grace period elapses. Asking again while an admin request is already pending changes nothing: the response is the same, but no second activity entry or owner email is produced and the grace period is not restarted.
     * @summary Request erasure of a whole tenant
     * @param {AdminBusinessesApiAdminBusinessesControllerRequestErasureV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerRequestErasureV1(
      requestParameters: AdminBusinessesApiAdminBusinessesControllerRequestErasureV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminBusinessResponseDto> {
      return localVarFp
        .adminBusinessesControllerRequestErasureV1(
          requestParameters.tenantId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`. Setting the status a tenant already has is a no-op: same response, no activity entry.
     * @summary Suspend or reactivate a tenant
     * @param {AdminBusinessesApiAdminBusinessesControllerUpdateStatusV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerUpdateStatusV1(
      requestParameters: AdminBusinessesApiAdminBusinessesControllerUpdateStatusV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminBusinessResponseDto> {
      return localVarFp
        .adminBusinessesControllerUpdateStatusV1(
          requestParameters.tenantId,
          requestParameters.updateBusinessStatusDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminBusinessesApi - interface
 */
export interface AdminBusinessesApiInterface {
  /**
   * Restores the tenant to active and clears the pending marker — a clean, full undo, since nothing is anonymized until the grace period actually elapses.
   * @summary Cancel a pending tenant erasure
   * @param {AdminBusinessesApiAdminBusinessesControllerCancelErasureV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBusinessesControllerCancelErasureV1(
    requestParameters: AdminBusinessesApiAdminBusinessesControllerCancelErasureV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminBusinessResponseDto>;

  /**
   * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection. `search` is applied server-side (tenant name or owner name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
   * @summary List every tenant, as a Super Admin \"business\"
   * @param {AdminBusinessesApiAdminBusinessesControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBusinessesControllerListV1(
    requestParameters?: AdminBusinessesApiAdminBusinessesControllerListV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminBusinessListResponseDto>;

  /**
   * Platform-admin only (support/legal request) — never tenant-owner self-service. Suspends the tenant immediately, so every user in it loses access now; the actual anonymization of every user runs later, in a nightly job, once `ERASURE_GRACE_PERIOD_DAYS` has elapsed. Reviews, replies, locations, connections, and billing records are never touched — no PII lives in them once every user is anonymized. Cancellable any time before the grace period elapses. Asking again while an admin request is already pending changes nothing: the response is the same, but no second activity entry or owner email is produced and the grace period is not restarted.
   * @summary Request erasure of a whole tenant
   * @param {AdminBusinessesApiAdminBusinessesControllerRequestErasureV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBusinessesControllerRequestErasureV1(
    requestParameters: AdminBusinessesApiAdminBusinessesControllerRequestErasureV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminBusinessResponseDto>;

  /**
   * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`. Setting the status a tenant already has is a no-op: same response, no activity entry.
   * @summary Suspend or reactivate a tenant
   * @param {AdminBusinessesApiAdminBusinessesControllerUpdateStatusV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBusinessesControllerUpdateStatusV1(
    requestParameters: AdminBusinessesApiAdminBusinessesControllerUpdateStatusV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminBusinessResponseDto>;
}

/**
 * Request parameters for adminBusinessesControllerCancelErasureV1 operation in AdminBusinessesApi.
 */
export interface AdminBusinessesApiAdminBusinessesControllerCancelErasureV1Request {
  /**
   * The tenant to restore
   */
  readonly tenantId: string;
}

/**
 * Request parameters for adminBusinessesControllerListV1 operation in AdminBusinessesApi.
 */
export interface AdminBusinessesApiAdminBusinessesControllerListV1Request {
  /**
   * Case-insensitive substring match against the tenant name or its owner name.
   */
  readonly search?: string;

  /**
   * 1-based page number.
   */
  readonly page?: number;

  readonly pageSize?: number;
}

/**
 * Request parameters for adminBusinessesControllerRequestErasureV1 operation in AdminBusinessesApi.
 */
export interface AdminBusinessesApiAdminBusinessesControllerRequestErasureV1Request {
  /**
   * The tenant to erase
   */
  readonly tenantId: string;
}

/**
 * Request parameters for adminBusinessesControllerUpdateStatusV1 operation in AdminBusinessesApi.
 */
export interface AdminBusinessesApiAdminBusinessesControllerUpdateStatusV1Request {
  readonly tenantId: string;

  readonly updateBusinessStatusDto: UpdateBusinessStatusDto;
}

/**
 * AdminBusinessesApi - object-oriented interface
 */
export class AdminBusinessesApi
  extends BaseAPI
  implements AdminBusinessesApiInterface
{
  /**
   * Restores the tenant to active and clears the pending marker — a clean, full undo, since nothing is anonymized until the grace period actually elapses.
   * @summary Cancel a pending tenant erasure
   * @param {AdminBusinessesApiAdminBusinessesControllerCancelErasureV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBusinessesControllerCancelErasureV1(
    requestParameters: AdminBusinessesApiAdminBusinessesControllerCancelErasureV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBusinessesApiFp(this.configuration)
      .adminBusinessesControllerCancelErasureV1(
        requestParameters.tenantId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection. `search` is applied server-side (tenant name or owner name substring, case-insensitive), and the result is paged: `page` (1-based) and `pageSize` (default 10, max 100), newest first, with `meta.total` counting the same filter.
   * @summary List every tenant, as a Super Admin \"business\"
   * @param {AdminBusinessesApiAdminBusinessesControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBusinessesControllerListV1(
    requestParameters: AdminBusinessesApiAdminBusinessesControllerListV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBusinessesApiFp(this.configuration)
      .adminBusinessesControllerListV1(
        requestParameters.search,
        requestParameters.page,
        requestParameters.pageSize,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Platform-admin only (support/legal request) — never tenant-owner self-service. Suspends the tenant immediately, so every user in it loses access now; the actual anonymization of every user runs later, in a nightly job, once `ERASURE_GRACE_PERIOD_DAYS` has elapsed. Reviews, replies, locations, connections, and billing records are never touched — no PII lives in them once every user is anonymized. Cancellable any time before the grace period elapses. Asking again while an admin request is already pending changes nothing: the response is the same, but no second activity entry or owner email is produced and the grace period is not restarted.
   * @summary Request erasure of a whole tenant
   * @param {AdminBusinessesApiAdminBusinessesControllerRequestErasureV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBusinessesControllerRequestErasureV1(
    requestParameters: AdminBusinessesApiAdminBusinessesControllerRequestErasureV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBusinessesApiFp(this.configuration)
      .adminBusinessesControllerRequestErasureV1(
        requestParameters.tenantId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`. Setting the status a tenant already has is a no-op: same response, no activity entry.
   * @summary Suspend or reactivate a tenant
   * @param {AdminBusinessesApiAdminBusinessesControllerUpdateStatusV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBusinessesControllerUpdateStatusV1(
    requestParameters: AdminBusinessesApiAdminBusinessesControllerUpdateStatusV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBusinessesApiFp(this.configuration)
      .adminBusinessesControllerUpdateStatusV1(
        requestParameters.tenantId,
        requestParameters.updateBusinessStatusDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
