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
import type { ApproveReplyDto } from '../models';
// @ts-ignore
import type { ReviewDetailResponseDto } from '../models';
// @ts-ignore
import type { ReviewListResponseDto } from '../models';
// @ts-ignore
import type { ReviewResponseItemDto } from '../models';
/**
 * ReviewsApi - axios parameter creator
 */
export const ReviewsApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Persists the decision — records who approved it and when. Omit `content` to approve the draft as-is; pass edited text and the response is recorded as `human_edited` instead of its original source. Supersedes every other still-pending sibling on the same review, since only one reply can ever be live per review. Lands the response at `status: approved`, never `posted` — actually publishing to Google Business Profile is a separate, not-yet-built step.
     * @summary Approve a pending reply draft
     * @param {string} reviewId
     * @param {string} responseId
     * @param {ApproveReplyDto} approveReplyDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerApproveReplyV1: async (
      reviewId: string,
      responseId: string,
      approveReplyDto: ApproveReplyDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'reviewId' is not null or undefined
      assertParamExists(
        'reviewsControllerApproveReplyV1',
        'reviewId',
        reviewId,
      );
      // verify required parameter 'responseId' is not null or undefined
      assertParamExists(
        'reviewsControllerApproveReplyV1',
        'responseId',
        responseId,
      );
      // verify required parameter 'approveReplyDto' is not null or undefined
      assertParamExists(
        'reviewsControllerApproveReplyV1',
        'approveReplyDto',
        approveReplyDto,
      );
      const localVarPath =
        `/v1/reviews/{reviewId}/responses/{responseId}/approve`
          .replace('{reviewId}', encodeURIComponent(String(reviewId)))
          .replace('{responseId}', encodeURIComponent(String(responseId)));
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
        approveReplyDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Terminal responses are returned deliberately — the UI renders rejected and superseded rows greyed out with their outcome, which is the entire reason `superseded` is a state rather than a deletion. `status` is a projection onto the four values the client understands (draft→pending_approval, posted/post_failed→approved), because the shipped card treats that union as exhaustive and a raw seven-value enum yields an unstyled badge and a missing translation key. `label` (\"A\", \"B\") is derived from position within generationGroupId, not stored. `generationMetadata` is deliberately never returned — it holds model/region/token counts for server-side debugging.
     * @summary One review with every response attached
     * @param {string} reviewId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerGetReviewV1: async (
      reviewId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'reviewId' is not null or undefined
      assertParamExists('reviewsControllerGetReviewV1', 'reviewId', reviewId);
      const localVarPath = `/v1/reviews/{reviewId}`.replace(
        '{reviewId}',
        encodeURIComponent(String(reviewId)),
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
     * One page of the caller\'s tenant\'s reviews, newest-reviewed first, each carrying a compact summary of its live response so the client can render the computed status badge without a second request per row. Filtering is server-side: `status` and `classification` map onto indexed columns, `search` is a case-insensitive match on reviewer_name only (matching the frontend). Note the frontend\'s \"unclassified\" is not a valid classification value — no column backs it.
     * @summary The review queue listing
     * @param {ReviewsControllerListReviewsV1StatusEnum} [status]
     * @param {ReviewsControllerListReviewsV1ClassificationEnum} [classification] The frontend\&#39;s \&quot;unclassified\&quot; is NOT a valid value here — it has no column behind it.
     * @param {string} [locationId] A location from another tenant yields an empty page, not a 403.
     * @param {string} [search] Case-insensitive substring match on reviewer_name only — matching the frontend, which searches reviewer name, not review text. An anonymized row has a NULL name and can never match, which is the intended privacy outcome.
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerListReviewsV1: async (
      status?: ReviewsControllerListReviewsV1StatusEnum,
      classification?: ReviewsControllerListReviewsV1ClassificationEnum,
      locationId?: string,
      search?: string,
      page?: number,
      pageSize?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/reviews`;
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

      if (classification !== undefined) {
        localVarQueryParameter['classification'] = classification;
      }

      if (locationId !== undefined) {
        localVarQueryParameter['locationId'] = locationId;
      }

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
     * Persists the decision — records who rejected it and when (`rejectedByUserId`/`decidedAt`), no free-text reason. The row is kept, not deleted: a rejected sibling is shown greyed out with its outcome, the same reasoning `superseded` rows already follow.
     * @summary Reject a pending reply draft
     * @param {string} reviewId
     * @param {string} responseId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerRejectReplyV1: async (
      reviewId: string,
      responseId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'reviewId' is not null or undefined
      assertParamExists('reviewsControllerRejectReplyV1', 'reviewId', reviewId);
      // verify required parameter 'responseId' is not null or undefined
      assertParamExists(
        'reviewsControllerRejectReplyV1',
        'responseId',
        responseId,
      );
      const localVarPath =
        `/v1/reviews/{reviewId}/responses/{responseId}/reject`
          .replace('{reviewId}', encodeURIComponent(String(reviewId)))
          .replace('{responseId}', encodeURIComponent(String(responseId)));
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
  };
};

/**
 * ReviewsApi - functional programming interface
 */
export const ReviewsApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = ReviewsApiAxiosParamCreator(configuration);
  return {
    /**
     * Persists the decision — records who approved it and when. Omit `content` to approve the draft as-is; pass edited text and the response is recorded as `human_edited` instead of its original source. Supersedes every other still-pending sibling on the same review, since only one reply can ever be live per review. Lands the response at `status: approved`, never `posted` — actually publishing to Google Business Profile is a separate, not-yet-built step.
     * @summary Approve a pending reply draft
     * @param {string} reviewId
     * @param {string} responseId
     * @param {ApproveReplyDto} approveReplyDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async reviewsControllerApproveReplyV1(
      reviewId: string,
      responseId: string,
      approveReplyDto: ApproveReplyDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ReviewResponseItemDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.reviewsControllerApproveReplyV1(
          reviewId,
          responseId,
          approveReplyDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['ReviewsApi.reviewsControllerApproveReplyV1']?.[
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
     * Terminal responses are returned deliberately — the UI renders rejected and superseded rows greyed out with their outcome, which is the entire reason `superseded` is a state rather than a deletion. `status` is a projection onto the four values the client understands (draft→pending_approval, posted/post_failed→approved), because the shipped card treats that union as exhaustive and a raw seven-value enum yields an unstyled badge and a missing translation key. `label` (\"A\", \"B\") is derived from position within generationGroupId, not stored. `generationMetadata` is deliberately never returned — it holds model/region/token counts for server-side debugging.
     * @summary One review with every response attached
     * @param {string} reviewId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async reviewsControllerGetReviewV1(
      reviewId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ReviewDetailResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.reviewsControllerGetReviewV1(
          reviewId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['ReviewsApi.reviewsControllerGetReviewV1']?.[
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
     * One page of the caller\'s tenant\'s reviews, newest-reviewed first, each carrying a compact summary of its live response so the client can render the computed status badge without a second request per row. Filtering is server-side: `status` and `classification` map onto indexed columns, `search` is a case-insensitive match on reviewer_name only (matching the frontend). Note the frontend\'s \"unclassified\" is not a valid classification value — no column backs it.
     * @summary The review queue listing
     * @param {ReviewsControllerListReviewsV1StatusEnum} [status]
     * @param {ReviewsControllerListReviewsV1ClassificationEnum} [classification] The frontend\&#39;s \&quot;unclassified\&quot; is NOT a valid value here — it has no column behind it.
     * @param {string} [locationId] A location from another tenant yields an empty page, not a 403.
     * @param {string} [search] Case-insensitive substring match on reviewer_name only — matching the frontend, which searches reviewer name, not review text. An anonymized row has a NULL name and can never match, which is the intended privacy outcome.
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async reviewsControllerListReviewsV1(
      status?: ReviewsControllerListReviewsV1StatusEnum,
      classification?: ReviewsControllerListReviewsV1ClassificationEnum,
      locationId?: string,
      search?: string,
      page?: number,
      pageSize?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ReviewListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.reviewsControllerListReviewsV1(
          status,
          classification,
          locationId,
          search,
          page,
          pageSize,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['ReviewsApi.reviewsControllerListReviewsV1']?.[
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
     * Persists the decision — records who rejected it and when (`rejectedByUserId`/`decidedAt`), no free-text reason. The row is kept, not deleted: a rejected sibling is shown greyed out with its outcome, the same reasoning `superseded` rows already follow.
     * @summary Reject a pending reply draft
     * @param {string} reviewId
     * @param {string} responseId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async reviewsControllerRejectReplyV1(
      reviewId: string,
      responseId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ReviewResponseItemDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.reviewsControllerRejectReplyV1(
          reviewId,
          responseId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['ReviewsApi.reviewsControllerRejectReplyV1']?.[
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
 * ReviewsApi - factory interface
 */
export const ReviewsApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = ReviewsApiFp(configuration);
  return {
    /**
     * Persists the decision — records who approved it and when. Omit `content` to approve the draft as-is; pass edited text and the response is recorded as `human_edited` instead of its original source. Supersedes every other still-pending sibling on the same review, since only one reply can ever be live per review. Lands the response at `status: approved`, never `posted` — actually publishing to Google Business Profile is a separate, not-yet-built step.
     * @summary Approve a pending reply draft
     * @param {ReviewsApiReviewsControllerApproveReplyV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerApproveReplyV1(
      requestParameters: ReviewsApiReviewsControllerApproveReplyV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ReviewResponseItemDto> {
      return localVarFp
        .reviewsControllerApproveReplyV1(
          requestParameters.reviewId,
          requestParameters.responseId,
          requestParameters.approveReplyDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Terminal responses are returned deliberately — the UI renders rejected and superseded rows greyed out with their outcome, which is the entire reason `superseded` is a state rather than a deletion. `status` is a projection onto the four values the client understands (draft→pending_approval, posted/post_failed→approved), because the shipped card treats that union as exhaustive and a raw seven-value enum yields an unstyled badge and a missing translation key. `label` (\"A\", \"B\") is derived from position within generationGroupId, not stored. `generationMetadata` is deliberately never returned — it holds model/region/token counts for server-side debugging.
     * @summary One review with every response attached
     * @param {ReviewsApiReviewsControllerGetReviewV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerGetReviewV1(
      requestParameters: ReviewsApiReviewsControllerGetReviewV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ReviewDetailResponseDto> {
      return localVarFp
        .reviewsControllerGetReviewV1(requestParameters.reviewId, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * One page of the caller\'s tenant\'s reviews, newest-reviewed first, each carrying a compact summary of its live response so the client can render the computed status badge without a second request per row. Filtering is server-side: `status` and `classification` map onto indexed columns, `search` is a case-insensitive match on reviewer_name only (matching the frontend). Note the frontend\'s \"unclassified\" is not a valid classification value — no column backs it.
     * @summary The review queue listing
     * @param {ReviewsApiReviewsControllerListReviewsV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerListReviewsV1(
      requestParameters: ReviewsApiReviewsControllerListReviewsV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ReviewListResponseDto> {
      return localVarFp
        .reviewsControllerListReviewsV1(
          requestParameters.status,
          requestParameters.classification,
          requestParameters.locationId,
          requestParameters.search,
          requestParameters.page,
          requestParameters.pageSize,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Persists the decision — records who rejected it and when (`rejectedByUserId`/`decidedAt`), no free-text reason. The row is kept, not deleted: a rejected sibling is shown greyed out with its outcome, the same reasoning `superseded` rows already follow.
     * @summary Reject a pending reply draft
     * @param {ReviewsApiReviewsControllerRejectReplyV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    reviewsControllerRejectReplyV1(
      requestParameters: ReviewsApiReviewsControllerRejectReplyV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ReviewResponseItemDto> {
      return localVarFp
        .reviewsControllerRejectReplyV1(
          requestParameters.reviewId,
          requestParameters.responseId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * ReviewsApi - interface
 */
export interface ReviewsApiInterface {
  /**
   * Persists the decision — records who approved it and when. Omit `content` to approve the draft as-is; pass edited text and the response is recorded as `human_edited` instead of its original source. Supersedes every other still-pending sibling on the same review, since only one reply can ever be live per review. Lands the response at `status: approved`, never `posted` — actually publishing to Google Business Profile is a separate, not-yet-built step.
   * @summary Approve a pending reply draft
   * @param {ReviewsApiReviewsControllerApproveReplyV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  reviewsControllerApproveReplyV1(
    requestParameters: ReviewsApiReviewsControllerApproveReplyV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ReviewResponseItemDto>;

  /**
   * Terminal responses are returned deliberately — the UI renders rejected and superseded rows greyed out with their outcome, which is the entire reason `superseded` is a state rather than a deletion. `status` is a projection onto the four values the client understands (draft→pending_approval, posted/post_failed→approved), because the shipped card treats that union as exhaustive and a raw seven-value enum yields an unstyled badge and a missing translation key. `label` (\"A\", \"B\") is derived from position within generationGroupId, not stored. `generationMetadata` is deliberately never returned — it holds model/region/token counts for server-side debugging.
   * @summary One review with every response attached
   * @param {ReviewsApiReviewsControllerGetReviewV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  reviewsControllerGetReviewV1(
    requestParameters: ReviewsApiReviewsControllerGetReviewV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ReviewDetailResponseDto>;

  /**
   * One page of the caller\'s tenant\'s reviews, newest-reviewed first, each carrying a compact summary of its live response so the client can render the computed status badge without a second request per row. Filtering is server-side: `status` and `classification` map onto indexed columns, `search` is a case-insensitive match on reviewer_name only (matching the frontend). Note the frontend\'s \"unclassified\" is not a valid classification value — no column backs it.
   * @summary The review queue listing
   * @param {ReviewsApiReviewsControllerListReviewsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  reviewsControllerListReviewsV1(
    requestParameters?: ReviewsApiReviewsControllerListReviewsV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ReviewListResponseDto>;

  /**
   * Persists the decision — records who rejected it and when (`rejectedByUserId`/`decidedAt`), no free-text reason. The row is kept, not deleted: a rejected sibling is shown greyed out with its outcome, the same reasoning `superseded` rows already follow.
   * @summary Reject a pending reply draft
   * @param {ReviewsApiReviewsControllerRejectReplyV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  reviewsControllerRejectReplyV1(
    requestParameters: ReviewsApiReviewsControllerRejectReplyV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ReviewResponseItemDto>;
}

/**
 * Request parameters for reviewsControllerApproveReplyV1 operation in ReviewsApi.
 */
export interface ReviewsApiReviewsControllerApproveReplyV1Request {
  readonly reviewId: string;

  readonly responseId: string;

  readonly approveReplyDto: ApproveReplyDto;
}

/**
 * Request parameters for reviewsControllerGetReviewV1 operation in ReviewsApi.
 */
export interface ReviewsApiReviewsControllerGetReviewV1Request {
  readonly reviewId: string;
}

/**
 * Request parameters for reviewsControllerListReviewsV1 operation in ReviewsApi.
 */
export interface ReviewsApiReviewsControllerListReviewsV1Request {
  readonly status?: ReviewsControllerListReviewsV1StatusEnum;

  /**
   * The frontend\&#39;s \&quot;unclassified\&quot; is NOT a valid value here — it has no column behind it.
   */
  readonly classification?: ReviewsControllerListReviewsV1ClassificationEnum;

  /**
   * A location from another tenant yields an empty page, not a 403.
   */
  readonly locationId?: string;

  /**
   * Case-insensitive substring match on reviewer_name only — matching the frontend, which searches reviewer name, not review text. An anonymized row has a NULL name and can never match, which is the intended privacy outcome.
   */
  readonly search?: string;

  readonly page?: number;

  readonly pageSize?: number;
}

/**
 * Request parameters for reviewsControllerRejectReplyV1 operation in ReviewsApi.
 */
export interface ReviewsApiReviewsControllerRejectReplyV1Request {
  readonly reviewId: string;

  readonly responseId: string;
}

/**
 * ReviewsApi - object-oriented interface
 */
export class ReviewsApi extends BaseAPI implements ReviewsApiInterface {
  /**
   * Persists the decision — records who approved it and when. Omit `content` to approve the draft as-is; pass edited text and the response is recorded as `human_edited` instead of its original source. Supersedes every other still-pending sibling on the same review, since only one reply can ever be live per review. Lands the response at `status: approved`, never `posted` — actually publishing to Google Business Profile is a separate, not-yet-built step.
   * @summary Approve a pending reply draft
   * @param {ReviewsApiReviewsControllerApproveReplyV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public reviewsControllerApproveReplyV1(
    requestParameters: ReviewsApiReviewsControllerApproveReplyV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ReviewsApiFp(this.configuration)
      .reviewsControllerApproveReplyV1(
        requestParameters.reviewId,
        requestParameters.responseId,
        requestParameters.approveReplyDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Terminal responses are returned deliberately — the UI renders rejected and superseded rows greyed out with their outcome, which is the entire reason `superseded` is a state rather than a deletion. `status` is a projection onto the four values the client understands (draft→pending_approval, posted/post_failed→approved), because the shipped card treats that union as exhaustive and a raw seven-value enum yields an unstyled badge and a missing translation key. `label` (\"A\", \"B\") is derived from position within generationGroupId, not stored. `generationMetadata` is deliberately never returned — it holds model/region/token counts for server-side debugging.
   * @summary One review with every response attached
   * @param {ReviewsApiReviewsControllerGetReviewV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public reviewsControllerGetReviewV1(
    requestParameters: ReviewsApiReviewsControllerGetReviewV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ReviewsApiFp(this.configuration)
      .reviewsControllerGetReviewV1(requestParameters.reviewId, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * One page of the caller\'s tenant\'s reviews, newest-reviewed first, each carrying a compact summary of its live response so the client can render the computed status badge without a second request per row. Filtering is server-side: `status` and `classification` map onto indexed columns, `search` is a case-insensitive match on reviewer_name only (matching the frontend). Note the frontend\'s \"unclassified\" is not a valid classification value — no column backs it.
   * @summary The review queue listing
   * @param {ReviewsApiReviewsControllerListReviewsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public reviewsControllerListReviewsV1(
    requestParameters: ReviewsApiReviewsControllerListReviewsV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return ReviewsApiFp(this.configuration)
      .reviewsControllerListReviewsV1(
        requestParameters.status,
        requestParameters.classification,
        requestParameters.locationId,
        requestParameters.search,
        requestParameters.page,
        requestParameters.pageSize,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Persists the decision — records who rejected it and when (`rejectedByUserId`/`decidedAt`), no free-text reason. The row is kept, not deleted: a rejected sibling is shown greyed out with its outcome, the same reasoning `superseded` rows already follow.
   * @summary Reject a pending reply draft
   * @param {ReviewsApiReviewsControllerRejectReplyV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public reviewsControllerRejectReplyV1(
    requestParameters: ReviewsApiReviewsControllerRejectReplyV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return ReviewsApiFp(this.configuration)
      .reviewsControllerRejectReplyV1(
        requestParameters.reviewId,
        requestParameters.responseId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}

export const ReviewsControllerListReviewsV1StatusEnum = {
  New: 'new',
  InReview: 'in_review',
  Responded: 'responded',
  Dismissed: 'dismissed',
} as const;
export type ReviewsControllerListReviewsV1StatusEnum =
  (typeof ReviewsControllerListReviewsV1StatusEnum)[keyof typeof ReviewsControllerListReviewsV1StatusEnum];
export const ReviewsControllerListReviewsV1ClassificationEnum = {
  AutoReplyCandidate: 'auto_reply_candidate',
  Escalated: 'escalated',
  PendingClassification: 'pending_classification',
} as const;
export type ReviewsControllerListReviewsV1ClassificationEnum =
  (typeof ReviewsControllerListReviewsV1ClassificationEnum)[keyof typeof ReviewsControllerListReviewsV1ClassificationEnum];
