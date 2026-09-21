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
import type { UpdateBusinessStatusDto } from '../models';
/**
 * AdminBusinessesApi - axios parameter creator
 */
export const AdminBusinessesApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection.
     * @summary List every tenant, as a Super Admin \"business\"
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerListV1: async (
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
     * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`.
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
     * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection.
     * @summary List every tenant, as a Super Admin \"business\"
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBusinessesControllerListV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<AdminBusinessResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBusinessesControllerListV1(
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
     * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`.
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
     * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection.
     * @summary List every tenant, as a Super Admin \"business\"
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBusinessesControllerListV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<AdminBusinessResponseDto>> {
      return localVarFp
        .adminBusinessesControllerListV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`.
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
   * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection.
   * @summary List every tenant, as a Super Admin \"business\"
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBusinessesControllerListV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<AdminBusinessResponseDto>>;

  /**
   * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`.
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
   * Platform-admin only. `status` collapses the real 3-value tenant_status (pending_activation/active/suspended) into active/suspended for display; `connectionStatus` derives from the tenant\'s most recent review_provider_connections row the same way ConnectionsService already reasons about a tenant\'s own connection.
   * @summary List every tenant, as a Super Admin \"business\"
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBusinessesControllerListV1(options?: RawAxiosRequestConfig) {
    return AdminBusinessesApiFp(this.configuration)
      .adminBusinessesControllerListV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Reactivating always lands the real tenant_status on `active`, never back on `pending_activation`.
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
