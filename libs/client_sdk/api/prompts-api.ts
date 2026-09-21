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
import type { CreatePromptVersionDto } from '../models';
// @ts-ignore
import type { CreatePromptVersionResponseDto } from '../models';
// @ts-ignore
import type { PromptListResponseDto } from '../models';
// @ts-ignore
import type { UpdatePromptToneDto } from '../models';
// @ts-ignore
import type { UpdatePromptToneResponseDto } from '../models';
/**
 * PromptsApi - axios parameter creator
 */
export const PromptsApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Inserts a new prompt_versions row. Sanitizes the template, requires allowlisted {{placeholders}}, and rejects unchanged text.
     * @summary Append a prompt version
     * @param {string} promptId
     * @param {CreatePromptVersionDto} createPromptVersionDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    promptsControllerCreateVersionV1: async (
      promptId: string,
      createPromptVersionDto: CreatePromptVersionDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'promptId' is not null or undefined
      assertParamExists(
        'promptsControllerCreateVersionV1',
        'promptId',
        promptId,
      );
      // verify required parameter 'createPromptVersionDto' is not null or undefined
      assertParamExists(
        'promptsControllerCreateVersionV1',
        'createPromptVersionDto',
        createPromptVersionDto,
      );
      const localVarPath = `/v1/prompts/{promptId}/versions`.replace(
        '{promptId}',
        encodeURIComponent(String(promptId)),
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
        createPromptVersionDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Returns every prompt for the caller tenant. includeHistory embeds versions oldest-first.
     * @summary List tenant prompts
     * @param {boolean} [includeHistory] When true, embed every version per prompt (oldest first)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    promptsControllerListV1: async (
      includeHistory?: boolean,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/prompts`;
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

      if (includeHistory !== undefined) {
        localVarQueryParameter['includeHistory'] = includeHistory;
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
     * Updates prompts.tone in place. Does not append a prompt_versions row.
     * @summary Update prompt tone
     * @param {string} promptId
     * @param {UpdatePromptToneDto} updatePromptToneDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    promptsControllerUpdateToneV1: async (
      promptId: string,
      updatePromptToneDto: UpdatePromptToneDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'promptId' is not null or undefined
      assertParamExists('promptsControllerUpdateToneV1', 'promptId', promptId);
      // verify required parameter 'updatePromptToneDto' is not null or undefined
      assertParamExists(
        'promptsControllerUpdateToneV1',
        'updatePromptToneDto',
        updatePromptToneDto,
      );
      const localVarPath = `/v1/prompts/{promptId}/tone`.replace(
        '{promptId}',
        encodeURIComponent(String(promptId)),
      );
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
        updatePromptToneDto,
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
 * PromptsApi - functional programming interface
 */
export const PromptsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = PromptsApiAxiosParamCreator(configuration);
  return {
    /**
     * Inserts a new prompt_versions row. Sanitizes the template, requires allowlisted {{placeholders}}, and rejects unchanged text.
     * @summary Append a prompt version
     * @param {string} promptId
     * @param {CreatePromptVersionDto} createPromptVersionDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async promptsControllerCreateVersionV1(
      promptId: string,
      createPromptVersionDto: CreatePromptVersionDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<CreatePromptVersionResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.promptsControllerCreateVersionV1(
          promptId,
          createPromptVersionDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['PromptsApi.promptsControllerCreateVersionV1']?.[
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
     * Returns every prompt for the caller tenant. includeHistory embeds versions oldest-first.
     * @summary List tenant prompts
     * @param {boolean} [includeHistory] When true, embed every version per prompt (oldest first)
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async promptsControllerListV1(
      includeHistory?: boolean,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<PromptListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.promptsControllerListV1(
          includeHistory,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['PromptsApi.promptsControllerListV1']?.[
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
     * Updates prompts.tone in place. Does not append a prompt_versions row.
     * @summary Update prompt tone
     * @param {string} promptId
     * @param {UpdatePromptToneDto} updatePromptToneDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async promptsControllerUpdateToneV1(
      promptId: string,
      updatePromptToneDto: UpdatePromptToneDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<UpdatePromptToneResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.promptsControllerUpdateToneV1(
          promptId,
          updatePromptToneDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['PromptsApi.promptsControllerUpdateToneV1']?.[
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
 * PromptsApi - factory interface
 */
export const PromptsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = PromptsApiFp(configuration);
  return {
    /**
     * Inserts a new prompt_versions row. Sanitizes the template, requires allowlisted {{placeholders}}, and rejects unchanged text.
     * @summary Append a prompt version
     * @param {PromptsApiPromptsControllerCreateVersionV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    promptsControllerCreateVersionV1(
      requestParameters: PromptsApiPromptsControllerCreateVersionV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<CreatePromptVersionResponseDto> {
      return localVarFp
        .promptsControllerCreateVersionV1(
          requestParameters.promptId,
          requestParameters.createPromptVersionDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Returns every prompt for the caller tenant. includeHistory embeds versions oldest-first.
     * @summary List tenant prompts
     * @param {PromptsApiPromptsControllerListV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    promptsControllerListV1(
      requestParameters: PromptsApiPromptsControllerListV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<PromptListResponseDto> {
      return localVarFp
        .promptsControllerListV1(requestParameters.includeHistory, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Updates prompts.tone in place. Does not append a prompt_versions row.
     * @summary Update prompt tone
     * @param {PromptsApiPromptsControllerUpdateToneV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    promptsControllerUpdateToneV1(
      requestParameters: PromptsApiPromptsControllerUpdateToneV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<UpdatePromptToneResponseDto> {
      return localVarFp
        .promptsControllerUpdateToneV1(
          requestParameters.promptId,
          requestParameters.updatePromptToneDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * PromptsApi - interface
 */
export interface PromptsApiInterface {
  /**
   * Inserts a new prompt_versions row. Sanitizes the template, requires allowlisted {{placeholders}}, and rejects unchanged text.
   * @summary Append a prompt version
   * @param {PromptsApiPromptsControllerCreateVersionV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  promptsControllerCreateVersionV1(
    requestParameters: PromptsApiPromptsControllerCreateVersionV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<CreatePromptVersionResponseDto>;

  /**
   * Returns every prompt for the caller tenant. includeHistory embeds versions oldest-first.
   * @summary List tenant prompts
   * @param {PromptsApiPromptsControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  promptsControllerListV1(
    requestParameters?: PromptsApiPromptsControllerListV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<PromptListResponseDto>;

  /**
   * Updates prompts.tone in place. Does not append a prompt_versions row.
   * @summary Update prompt tone
   * @param {PromptsApiPromptsControllerUpdateToneV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  promptsControllerUpdateToneV1(
    requestParameters: PromptsApiPromptsControllerUpdateToneV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<UpdatePromptToneResponseDto>;
}

/**
 * Request parameters for promptsControllerCreateVersionV1 operation in PromptsApi.
 */
export interface PromptsApiPromptsControllerCreateVersionV1Request {
  readonly promptId: string;

  readonly createPromptVersionDto: CreatePromptVersionDto;
}

/**
 * Request parameters for promptsControllerListV1 operation in PromptsApi.
 */
export interface PromptsApiPromptsControllerListV1Request {
  /**
   * When true, embed every version per prompt (oldest first)
   */
  readonly includeHistory?: boolean;
}

/**
 * Request parameters for promptsControllerUpdateToneV1 operation in PromptsApi.
 */
export interface PromptsApiPromptsControllerUpdateToneV1Request {
  readonly promptId: string;

  readonly updatePromptToneDto: UpdatePromptToneDto;
}

/**
 * PromptsApi - object-oriented interface
 */
export class PromptsApi extends BaseAPI implements PromptsApiInterface {
  /**
   * Inserts a new prompt_versions row. Sanitizes the template, requires allowlisted {{placeholders}}, and rejects unchanged text.
   * @summary Append a prompt version
   * @param {PromptsApiPromptsControllerCreateVersionV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public promptsControllerCreateVersionV1(
    requestParameters: PromptsApiPromptsControllerCreateVersionV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return PromptsApiFp(this.configuration)
      .promptsControllerCreateVersionV1(
        requestParameters.promptId,
        requestParameters.createPromptVersionDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Returns every prompt for the caller tenant. includeHistory embeds versions oldest-first.
   * @summary List tenant prompts
   * @param {PromptsApiPromptsControllerListV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public promptsControllerListV1(
    requestParameters: PromptsApiPromptsControllerListV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return PromptsApiFp(this.configuration)
      .promptsControllerListV1(requestParameters.includeHistory, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Updates prompts.tone in place. Does not append a prompt_versions row.
   * @summary Update prompt tone
   * @param {PromptsApiPromptsControllerUpdateToneV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public promptsControllerUpdateToneV1(
    requestParameters: PromptsApiPromptsControllerUpdateToneV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return PromptsApiFp(this.configuration)
      .promptsControllerUpdateToneV1(
        requestParameters.promptId,
        requestParameters.updatePromptToneDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
