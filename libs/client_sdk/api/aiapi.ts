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
import type { GenerateReplyDryRunDto } from '../models';
// @ts-ignore
import type { GenerateReplyDryRunResponseDto } from '../models';
/**
 * AIApi - axios parameter creator
 */
export const AIApiAxiosParamCreator = function (configuration?: Configuration) {
  return {
    /**
     * No authentication — pass `tenantId` to pick whose prompts to use, or omit it to fall back to the newest tenant. Fills that tenant\'s prompt template for `category` with a caller-supplied mock review and calls the configured AI provider. Nothing is persisted — this never writes a `review_responses` row, so it never counts against the plan\'s monthly AI-draft limit, though that limit is still checked. For testing prompt/tone configuration and the AI provider itself, ahead of a real classification → generation pipeline.
     * @summary Generate an AI reply for a mock review (dry run)
     * @param {GenerateReplyDryRunDto} generateReplyDryRunDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    aiControllerGenerateDryRunReplyV1: async (
      generateReplyDryRunDto: GenerateReplyDryRunDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'generateReplyDryRunDto' is not null or undefined
      assertParamExists(
        'aiControllerGenerateDryRunReplyV1',
        'generateReplyDryRunDto',
        generateReplyDryRunDto,
      );
      const localVarPath = `/v1/ai/dry-run`;
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
        generateReplyDryRunDto,
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
 * AIApi - functional programming interface
 */
export const AIApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = AIApiAxiosParamCreator(configuration);
  return {
    /**
     * No authentication — pass `tenantId` to pick whose prompts to use, or omit it to fall back to the newest tenant. Fills that tenant\'s prompt template for `category` with a caller-supplied mock review and calls the configured AI provider. Nothing is persisted — this never writes a `review_responses` row, so it never counts against the plan\'s monthly AI-draft limit, though that limit is still checked. For testing prompt/tone configuration and the AI provider itself, ahead of a real classification → generation pipeline.
     * @summary Generate an AI reply for a mock review (dry run)
     * @param {GenerateReplyDryRunDto} generateReplyDryRunDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async aiControllerGenerateDryRunReplyV1(
      generateReplyDryRunDto: GenerateReplyDryRunDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<GenerateReplyDryRunResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.aiControllerGenerateDryRunReplyV1(
          generateReplyDryRunDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['AIApi.aiControllerGenerateDryRunReplyV1']?.[
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
 * AIApi - factory interface
 */
export const AIApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AIApiFp(configuration);
  return {
    /**
     * No authentication — pass `tenantId` to pick whose prompts to use, or omit it to fall back to the newest tenant. Fills that tenant\'s prompt template for `category` with a caller-supplied mock review and calls the configured AI provider. Nothing is persisted — this never writes a `review_responses` row, so it never counts against the plan\'s monthly AI-draft limit, though that limit is still checked. For testing prompt/tone configuration and the AI provider itself, ahead of a real classification → generation pipeline.
     * @summary Generate an AI reply for a mock review (dry run)
     * @param {AIApiAiControllerGenerateDryRunReplyV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    aiControllerGenerateDryRunReplyV1(
      requestParameters: AIApiAiControllerGenerateDryRunReplyV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<GenerateReplyDryRunResponseDto> {
      return localVarFp
        .aiControllerGenerateDryRunReplyV1(
          requestParameters.generateReplyDryRunDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AIApi - interface
 */
export interface AIApiInterface {
  /**
   * No authentication — pass `tenantId` to pick whose prompts to use, or omit it to fall back to the newest tenant. Fills that tenant\'s prompt template for `category` with a caller-supplied mock review and calls the configured AI provider. Nothing is persisted — this never writes a `review_responses` row, so it never counts against the plan\'s monthly AI-draft limit, though that limit is still checked. For testing prompt/tone configuration and the AI provider itself, ahead of a real classification → generation pipeline.
   * @summary Generate an AI reply for a mock review (dry run)
   * @param {AIApiAiControllerGenerateDryRunReplyV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  aiControllerGenerateDryRunReplyV1(
    requestParameters: AIApiAiControllerGenerateDryRunReplyV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<GenerateReplyDryRunResponseDto>;
}

/**
 * Request parameters for aiControllerGenerateDryRunReplyV1 operation in AIApi.
 */
export interface AIApiAiControllerGenerateDryRunReplyV1Request {
  readonly generateReplyDryRunDto: GenerateReplyDryRunDto;
}

/**
 * AIApi - object-oriented interface
 */
export class AIApi extends BaseAPI implements AIApiInterface {
  /**
   * No authentication — pass `tenantId` to pick whose prompts to use, or omit it to fall back to the newest tenant. Fills that tenant\'s prompt template for `category` with a caller-supplied mock review and calls the configured AI provider. Nothing is persisted — this never writes a `review_responses` row, so it never counts against the plan\'s monthly AI-draft limit, though that limit is still checked. For testing prompt/tone configuration and the AI provider itself, ahead of a real classification → generation pipeline.
   * @summary Generate an AI reply for a mock review (dry run)
   * @param {AIApiAiControllerGenerateDryRunReplyV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public aiControllerGenerateDryRunReplyV1(
    requestParameters: AIApiAiControllerGenerateDryRunReplyV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AIApiFp(this.configuration)
      .aiControllerGenerateDryRunReplyV1(
        requestParameters.generateReplyDryRunDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
