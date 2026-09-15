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
import type { BlocklistTermDto } from '../models';
// @ts-ignore
import type { BlocklistTermListResponseDto } from '../models';
// @ts-ignore
import type { CreateBlocklistTermDto } from '../models';
// @ts-ignore
import type { DeleteBlocklistTermResponseDto } from '../models';
// @ts-ignore
import type { PlatformSettingsResponseDto } from '../models';
// @ts-ignore
import type { TenantSettingsResponseDto } from '../models';
// @ts-ignore
import type { UpdateTenantSettingsDto } from '../models';
/**
 * SettingsApi - axios parameter creator
 */
export const SettingsApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Inserts a term. The uniqueness check is case-insensitive — `idx_blocklist_terms_tenant_id_lower_term` is unique on `(tenant_id, lower(term))` — so a term the tenant already has is 409 regardless of casing. Removal is a hard delete, so a re-added term is a genuinely new row.
     * @summary Add a blocklist term
     * @param {CreateBlocklistTermDto} createBlocklistTermDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    blocklistTermsControllerCreateV1: async (
      createBlocklistTermDto: CreateBlocklistTermDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'createBlocklistTermDto' is not null or undefined
      assertParamExists(
        'blocklistTermsControllerCreateV1',
        'createBlocklistTermDto',
        createBlocklistTermDto,
      );
      const localVarPath = `/v1/settings/blocklist-terms`;
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
        createBlocklistTermDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Owner-only. Returns every term this tenant has, ordered case-insensitively. Not retroactive — adding a term does not reclassify existing reviews.
     * @summary List blocklist terms
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    blocklistTermsControllerListV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/settings/blocklist-terms`;
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
     * Hard delete. Cross-tenant ids return 404, not 403.
     * @summary Remove a blocklist term
     * @param {string} id
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    blocklistTermsControllerRemoveV1: async (
      id: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'id' is not null or undefined
      assertParamExists('blocklistTermsControllerRemoveV1', 'id', id);
      const localVarPath = `/v1/settings/blocklist-terms/{id}`.replace(
        '{id}',
        encodeURIComponent(String(id)),
      );
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
     * Public — no auth required. Which login methods the sign-in/sign-up screens offer, and whether a tenant Settings > Members tab can send invites. Read-only here; a Super Admin changes these from Admin Settings (PATCH /v1/admin/settings/platform-config).
     * @summary Get platform-wide feature settings
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformSettingsControllerGetV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/settings/platform-config`;
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
     * Owner-only. Reads the tenant_settings singleton. 404 if the signup transaction never wrote the row.
     * @summary Get tenant settings
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantSettingsControllerGetV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/settings`;
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
     * Owner-only full-resource replace. Not retroactive — already-classified reviews are unchanged. Omitting reviewDataRetentionMonths stores NULL, which opts this tenant out of the nightly reviewer-retention purge entirely — there is no platform-default fallback.
     * @summary Replace tenant settings
     * @param {UpdateTenantSettingsDto} updateTenantSettingsDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantSettingsControllerReplaceV1: async (
      updateTenantSettingsDto: UpdateTenantSettingsDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'updateTenantSettingsDto' is not null or undefined
      assertParamExists(
        'tenantSettingsControllerReplaceV1',
        'updateTenantSettingsDto',
        updateTenantSettingsDto,
      );
      const localVarPath = `/v1/settings`;
      // use dummy base URL string because the URL constructor only accepts absolute URLs.
      const localVarUrlObj = new URL(localVarPath, DUMMY_BASE_URL);
      let baseOptions;
      if (configuration) {
        baseOptions = configuration.baseOptions;
      }

      const localVarRequestOptions = {
        method: 'PUT',
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
        updateTenantSettingsDto,
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
 * SettingsApi - functional programming interface
 */
export const SettingsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = SettingsApiAxiosParamCreator(configuration);
  return {
    /**
     * Inserts a term. The uniqueness check is case-insensitive — `idx_blocklist_terms_tenant_id_lower_term` is unique on `(tenant_id, lower(term))` — so a term the tenant already has is 409 regardless of casing. Removal is a hard delete, so a re-added term is a genuinely new row.
     * @summary Add a blocklist term
     * @param {CreateBlocklistTermDto} createBlocklistTermDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async blocklistTermsControllerCreateV1(
      createBlocklistTermDto: CreateBlocklistTermDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<BlocklistTermDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.blocklistTermsControllerCreateV1(
          createBlocklistTermDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.blocklistTermsControllerCreateV1']?.[
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
     * Owner-only. Returns every term this tenant has, ordered case-insensitively. Not retroactive — adding a term does not reclassify existing reviews.
     * @summary List blocklist terms
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async blocklistTermsControllerListV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<BlocklistTermListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.blocklistTermsControllerListV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.blocklistTermsControllerListV1']?.[
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
     * Hard delete. Cross-tenant ids return 404, not 403.
     * @summary Remove a blocklist term
     * @param {string} id
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async blocklistTermsControllerRemoveV1(
      id: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<DeleteBlocklistTermResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.blocklistTermsControllerRemoveV1(
          id,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.blocklistTermsControllerRemoveV1']?.[
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
     * Public — no auth required. Which login methods the sign-in/sign-up screens offer, and whether a tenant Settings > Members tab can send invites. Read-only here; a Super Admin changes these from Admin Settings (PATCH /v1/admin/settings/platform-config).
     * @summary Get platform-wide feature settings
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async platformSettingsControllerGetV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<PlatformSettingsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.platformSettingsControllerGetV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.platformSettingsControllerGetV1']?.[
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
     * Owner-only. Reads the tenant_settings singleton. 404 if the signup transaction never wrote the row.
     * @summary Get tenant settings
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async tenantSettingsControllerGetV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TenantSettingsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.tenantSettingsControllerGetV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.tenantSettingsControllerGetV1']?.[
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
     * Owner-only full-resource replace. Not retroactive — already-classified reviews are unchanged. Omitting reviewDataRetentionMonths stores NULL, which opts this tenant out of the nightly reviewer-retention purge entirely — there is no platform-default fallback.
     * @summary Replace tenant settings
     * @param {UpdateTenantSettingsDto} updateTenantSettingsDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async tenantSettingsControllerReplaceV1(
      updateTenantSettingsDto: UpdateTenantSettingsDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TenantSettingsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.tenantSettingsControllerReplaceV1(
          updateTenantSettingsDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.tenantSettingsControllerReplaceV1']?.[
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
  };
};

/**
 * SettingsApi - factory interface
 */
export const SettingsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = SettingsApiFp(configuration);
  return {
    /**
     * Inserts a term. The uniqueness check is case-insensitive — `idx_blocklist_terms_tenant_id_lower_term` is unique on `(tenant_id, lower(term))` — so a term the tenant already has is 409 regardless of casing. Removal is a hard delete, so a re-added term is a genuinely new row.
     * @summary Add a blocklist term
     * @param {SettingsApiBlocklistTermsControllerCreateV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    blocklistTermsControllerCreateV1(
      requestParameters: SettingsApiBlocklistTermsControllerCreateV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<BlocklistTermDto> {
      return localVarFp
        .blocklistTermsControllerCreateV1(
          requestParameters.createBlocklistTermDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Owner-only. Returns every term this tenant has, ordered case-insensitively. Not retroactive — adding a term does not reclassify existing reviews.
     * @summary List blocklist terms
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    blocklistTermsControllerListV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<BlocklistTermListResponseDto> {
      return localVarFp
        .blocklistTermsControllerListV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Hard delete. Cross-tenant ids return 404, not 403.
     * @summary Remove a blocklist term
     * @param {SettingsApiBlocklistTermsControllerRemoveV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    blocklistTermsControllerRemoveV1(
      requestParameters: SettingsApiBlocklistTermsControllerRemoveV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<DeleteBlocklistTermResponseDto> {
      return localVarFp
        .blocklistTermsControllerRemoveV1(requestParameters.id, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Public — no auth required. Which login methods the sign-in/sign-up screens offer, and whether a tenant Settings > Members tab can send invites. Read-only here; a Super Admin changes these from Admin Settings (PATCH /v1/admin/settings/platform-config).
     * @summary Get platform-wide feature settings
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    platformSettingsControllerGetV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<PlatformSettingsResponseDto> {
      return localVarFp
        .platformSettingsControllerGetV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Owner-only. Reads the tenant_settings singleton. 404 if the signup transaction never wrote the row.
     * @summary Get tenant settings
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantSettingsControllerGetV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TenantSettingsResponseDto> {
      return localVarFp
        .tenantSettingsControllerGetV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Owner-only full-resource replace. Not retroactive — already-classified reviews are unchanged. Omitting reviewDataRetentionMonths stores NULL, which opts this tenant out of the nightly reviewer-retention purge entirely — there is no platform-default fallback.
     * @summary Replace tenant settings
     * @param {SettingsApiTenantSettingsControllerReplaceV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantSettingsControllerReplaceV1(
      requestParameters: SettingsApiTenantSettingsControllerReplaceV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TenantSettingsResponseDto> {
      return localVarFp
        .tenantSettingsControllerReplaceV1(
          requestParameters.updateTenantSettingsDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * SettingsApi - interface
 */
export interface SettingsApiInterface {
  /**
   * Inserts a term. The uniqueness check is case-insensitive — `idx_blocklist_terms_tenant_id_lower_term` is unique on `(tenant_id, lower(term))` — so a term the tenant already has is 409 regardless of casing. Removal is a hard delete, so a re-added term is a genuinely new row.
   * @summary Add a blocklist term
   * @param {SettingsApiBlocklistTermsControllerCreateV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  blocklistTermsControllerCreateV1(
    requestParameters: SettingsApiBlocklistTermsControllerCreateV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<BlocklistTermDto>;

  /**
   * Owner-only. Returns every term this tenant has, ordered case-insensitively. Not retroactive — adding a term does not reclassify existing reviews.
   * @summary List blocklist terms
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  blocklistTermsControllerListV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<BlocklistTermListResponseDto>;

  /**
   * Hard delete. Cross-tenant ids return 404, not 403.
   * @summary Remove a blocklist term
   * @param {SettingsApiBlocklistTermsControllerRemoveV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  blocklistTermsControllerRemoveV1(
    requestParameters: SettingsApiBlocklistTermsControllerRemoveV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<DeleteBlocklistTermResponseDto>;

  /**
   * Public — no auth required. Which login methods the sign-in/sign-up screens offer, and whether a tenant Settings > Members tab can send invites. Read-only here; a Super Admin changes these from Admin Settings (PATCH /v1/admin/settings/platform-config).
   * @summary Get platform-wide feature settings
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  platformSettingsControllerGetV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<PlatformSettingsResponseDto>;

  /**
   * Owner-only. Reads the tenant_settings singleton. 404 if the signup transaction never wrote the row.
   * @summary Get tenant settings
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  tenantSettingsControllerGetV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TenantSettingsResponseDto>;

  /**
   * Owner-only full-resource replace. Not retroactive — already-classified reviews are unchanged. Omitting reviewDataRetentionMonths stores NULL, which opts this tenant out of the nightly reviewer-retention purge entirely — there is no platform-default fallback.
   * @summary Replace tenant settings
   * @param {SettingsApiTenantSettingsControllerReplaceV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  tenantSettingsControllerReplaceV1(
    requestParameters: SettingsApiTenantSettingsControllerReplaceV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TenantSettingsResponseDto>;
}

/**
 * Request parameters for blocklistTermsControllerCreateV1 operation in SettingsApi.
 */
export interface SettingsApiBlocklistTermsControllerCreateV1Request {
  readonly createBlocklistTermDto: CreateBlocklistTermDto;
}

/**
 * Request parameters for blocklistTermsControllerRemoveV1 operation in SettingsApi.
 */
export interface SettingsApiBlocklistTermsControllerRemoveV1Request {
  readonly id: string;
}

/**
 * Request parameters for tenantSettingsControllerReplaceV1 operation in SettingsApi.
 */
export interface SettingsApiTenantSettingsControllerReplaceV1Request {
  readonly updateTenantSettingsDto: UpdateTenantSettingsDto;
}

/**
 * SettingsApi - object-oriented interface
 */
export class SettingsApi extends BaseAPI implements SettingsApiInterface {
  /**
   * Inserts a term. The uniqueness check is case-insensitive — `idx_blocklist_terms_tenant_id_lower_term` is unique on `(tenant_id, lower(term))` — so a term the tenant already has is 409 regardless of casing. Removal is a hard delete, so a re-added term is a genuinely new row.
   * @summary Add a blocklist term
   * @param {SettingsApiBlocklistTermsControllerCreateV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public blocklistTermsControllerCreateV1(
    requestParameters: SettingsApiBlocklistTermsControllerCreateV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return SettingsApiFp(this.configuration)
      .blocklistTermsControllerCreateV1(
        requestParameters.createBlocklistTermDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Owner-only. Returns every term this tenant has, ordered case-insensitively. Not retroactive — adding a term does not reclassify existing reviews.
   * @summary List blocklist terms
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public blocklistTermsControllerListV1(options?: RawAxiosRequestConfig) {
    return SettingsApiFp(this.configuration)
      .blocklistTermsControllerListV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Hard delete. Cross-tenant ids return 404, not 403.
   * @summary Remove a blocklist term
   * @param {SettingsApiBlocklistTermsControllerRemoveV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public blocklistTermsControllerRemoveV1(
    requestParameters: SettingsApiBlocklistTermsControllerRemoveV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return SettingsApiFp(this.configuration)
      .blocklistTermsControllerRemoveV1(requestParameters.id, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Public — no auth required. Which login methods the sign-in/sign-up screens offer, and whether a tenant Settings > Members tab can send invites. Read-only here; a Super Admin changes these from Admin Settings (PATCH /v1/admin/settings/platform-config).
   * @summary Get platform-wide feature settings
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public platformSettingsControllerGetV1(options?: RawAxiosRequestConfig) {
    return SettingsApiFp(this.configuration)
      .platformSettingsControllerGetV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Owner-only. Reads the tenant_settings singleton. 404 if the signup transaction never wrote the row.
   * @summary Get tenant settings
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public tenantSettingsControllerGetV1(options?: RawAxiosRequestConfig) {
    return SettingsApiFp(this.configuration)
      .tenantSettingsControllerGetV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Owner-only full-resource replace. Not retroactive — already-classified reviews are unchanged. Omitting reviewDataRetentionMonths stores NULL, which opts this tenant out of the nightly reviewer-retention purge entirely — there is no platform-default fallback.
   * @summary Replace tenant settings
   * @param {SettingsApiTenantSettingsControllerReplaceV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public tenantSettingsControllerReplaceV1(
    requestParameters: SettingsApiTenantSettingsControllerReplaceV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return SettingsApiFp(this.configuration)
      .tenantSettingsControllerReplaceV1(
        requestParameters.updateTenantSettingsDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
