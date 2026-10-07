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
import type { AdminBillingSummaryResponseDto } from '../models';
// @ts-ignore
import type { BillingWebhookEventListResponseDto } from '../models';
// @ts-ignore
import type { HasPaidTenantsResponseDto } from '../models';
/**
 * AdminBillingApi - axios parameter creator
 */
export const AdminBillingApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, and at-risk (past-due) subscriptions — the one place any of billing_plans/tenant_subscriptions gets an admin-facing read. Webhook activity is a separate, paginated endpoint — see ApiListBillingWebhookEvents.
     * @summary Platform-wide billing statistics
     * @param {number} [months] How many trailing calendar months the &#x60;upgradeTrend&#x60; series covers, counting back from the current one (inclusive). The other summary figures are all-time, not windowed by this.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerGetSummaryV1: async (
      months?: number,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/billing/summary`;
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
     * A cheap existence check, not the full billing summary — backs the admin frontend\'s Billing nav item / dashboard-route guard, which must stay available whenever at least one tenant is still on Paid, independent of PAYMENT_FEATURE_ENABLED (that flag only gates starting a new checkout, never an already-Paid tenant\'s subscription).
     * @summary Whether any tenant is currently on the Paid plan
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerHasPaidTenantsV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/billing/has-paid-tenants`;
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
     * The Stripe webhook deliveries (`stripe_webhook_events`) `BillingWebhooksService` actually acts on, newest first, resolved to the tenant its Stripe customer id belongs to where possible (null for an orphan delivery). Every other Stripe event type this app receives and ignores is out of scope for this endpoint entirely — a platform admin has no use for that raw traffic; debugging it is an engineering concern for Stripe\'s own Dashboard event log or backend logs instead. `type` narrows to one exact handled event type, by StripeWebhookEventType\'s own key name rather than the raw Stripe wire string.
     * @summary Paginated, filterable Stripe webhook activity
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {AdminBillingControllerListWebhookEventsV1TypeEnum} [type] One of StripeWebhookEventType\&#39;s own key names, not Stripe\&#39;s raw dotted wire format — this app\&#39;s own filter vocabulary never leaks Stripe\&#39;s internal naming into a URL. Mapped to the matching raw type internally before it reaches the repository.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerListWebhookEventsV1: async (
      page?: number,
      pageSize?: number,
      type?: AdminBillingControllerListWebhookEventsV1TypeEnum,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/admin/billing/webhook-events`;
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
    /**
     * Removes one entry from the billing summary\'s `postErasureCharges` queue once an admin has refunded the invoice in Stripe (or decided not to). Records who and when. Does not call Stripe. A repeat, an unknown id and a never-flagged receipt are all 404.
     * @summary Mark a charged-after-deletion-request payment as handled
     * @param {string} receiptId The &#x60;receiptId&#x60; from &#x60;postErasureCharges&#x60;.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerResolvePostErasureChargeV1: async (
      receiptId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'receiptId' is not null or undefined
      assertParamExists(
        'adminBillingControllerResolvePostErasureChargeV1',
        'receiptId',
        receiptId,
      );
      const localVarPath =
        `/v1/admin/billing/post-erasure-charges/{receiptId}/resolve`.replace(
          '{receiptId}',
          encodeURIComponent(String(receiptId)),
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
  };
};

/**
 * AdminBillingApi - functional programming interface
 */
export const AdminBillingApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator =
    AdminBillingApiAxiosParamCreator(configuration);
  return {
    /**
     * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, and at-risk (past-due) subscriptions — the one place any of billing_plans/tenant_subscriptions gets an admin-facing read. Webhook activity is a separate, paginated endpoint — see ApiListBillingWebhookEvents.
     * @summary Platform-wide billing statistics
     * @param {number} [months] How many trailing calendar months the &#x60;upgradeTrend&#x60; series covers, counting back from the current one (inclusive). The other summary figures are all-time, not windowed by this.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBillingControllerGetSummaryV1(
      months?: number,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<AdminBillingSummaryResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBillingControllerGetSummaryV1(
          months,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBillingApi.adminBillingControllerGetSummaryV1'
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
     * A cheap existence check, not the full billing summary — backs the admin frontend\'s Billing nav item / dashboard-route guard, which must stay available whenever at least one tenant is still on Paid, independent of PAYMENT_FEATURE_ENABLED (that flag only gates starting a new checkout, never an already-Paid tenant\'s subscription).
     * @summary Whether any tenant is currently on the Paid plan
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBillingControllerHasPaidTenantsV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<HasPaidTenantsResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBillingControllerHasPaidTenantsV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBillingApi.adminBillingControllerHasPaidTenantsV1'
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
     * The Stripe webhook deliveries (`stripe_webhook_events`) `BillingWebhooksService` actually acts on, newest first, resolved to the tenant its Stripe customer id belongs to where possible (null for an orphan delivery). Every other Stripe event type this app receives and ignores is out of scope for this endpoint entirely — a platform admin has no use for that raw traffic; debugging it is an engineering concern for Stripe\'s own Dashboard event log or backend logs instead. `type` narrows to one exact handled event type, by StripeWebhookEventType\'s own key name rather than the raw Stripe wire string.
     * @summary Paginated, filterable Stripe webhook activity
     * @param {number} [page]
     * @param {number} [pageSize]
     * @param {AdminBillingControllerListWebhookEventsV1TypeEnum} [type] One of StripeWebhookEventType\&#39;s own key names, not Stripe\&#39;s raw dotted wire format — this app\&#39;s own filter vocabulary never leaks Stripe\&#39;s internal naming into a URL. Mapped to the matching raw type internally before it reaches the repository.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBillingControllerListWebhookEventsV1(
      page?: number,
      pageSize?: number,
      type?: AdminBillingControllerListWebhookEventsV1TypeEnum,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<BillingWebhookEventListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBillingControllerListWebhookEventsV1(
          page,
          pageSize,
          type,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBillingApi.adminBillingControllerListWebhookEventsV1'
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
     * Removes one entry from the billing summary\'s `postErasureCharges` queue once an admin has refunded the invoice in Stripe (or decided not to). Records who and when. Does not call Stripe. A repeat, an unknown id and a never-flagged receipt are all 404.
     * @summary Mark a charged-after-deletion-request payment as handled
     * @param {string} receiptId The &#x60;receiptId&#x60; from &#x60;postErasureCharges&#x60;.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async adminBillingControllerResolvePostErasureChargeV1(
      receiptId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.adminBillingControllerResolvePostErasureChargeV1(
          receiptId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'AdminBillingApi.adminBillingControllerResolvePostErasureChargeV1'
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
 * AdminBillingApi - factory interface
 */
export const AdminBillingApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = AdminBillingApiFp(configuration);
  return {
    /**
     * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, and at-risk (past-due) subscriptions — the one place any of billing_plans/tenant_subscriptions gets an admin-facing read. Webhook activity is a separate, paginated endpoint — see ApiListBillingWebhookEvents.
     * @summary Platform-wide billing statistics
     * @param {AdminBillingApiAdminBillingControllerGetSummaryV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerGetSummaryV1(
      requestParameters: AdminBillingApiAdminBillingControllerGetSummaryV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<AdminBillingSummaryResponseDto> {
      return localVarFp
        .adminBillingControllerGetSummaryV1(requestParameters.months, options)
        .then((request) => request(axios, basePath));
    },
    /**
     * A cheap existence check, not the full billing summary — backs the admin frontend\'s Billing nav item / dashboard-route guard, which must stay available whenever at least one tenant is still on Paid, independent of PAYMENT_FEATURE_ENABLED (that flag only gates starting a new checkout, never an already-Paid tenant\'s subscription).
     * @summary Whether any tenant is currently on the Paid plan
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerHasPaidTenantsV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<HasPaidTenantsResponseDto> {
      return localVarFp
        .adminBillingControllerHasPaidTenantsV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * The Stripe webhook deliveries (`stripe_webhook_events`) `BillingWebhooksService` actually acts on, newest first, resolved to the tenant its Stripe customer id belongs to where possible (null for an orphan delivery). Every other Stripe event type this app receives and ignores is out of scope for this endpoint entirely — a platform admin has no use for that raw traffic; debugging it is an engineering concern for Stripe\'s own Dashboard event log or backend logs instead. `type` narrows to one exact handled event type, by StripeWebhookEventType\'s own key name rather than the raw Stripe wire string.
     * @summary Paginated, filterable Stripe webhook activity
     * @param {AdminBillingApiAdminBillingControllerListWebhookEventsV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerListWebhookEventsV1(
      requestParameters: AdminBillingApiAdminBillingControllerListWebhookEventsV1Request = {},
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<BillingWebhookEventListResponseDto> {
      return localVarFp
        .adminBillingControllerListWebhookEventsV1(
          requestParameters.page,
          requestParameters.pageSize,
          requestParameters.type,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Removes one entry from the billing summary\'s `postErasureCharges` queue once an admin has refunded the invoice in Stripe (or decided not to). Records who and when. Does not call Stripe. A repeat, an unknown id and a never-flagged receipt are all 404.
     * @summary Mark a charged-after-deletion-request payment as handled
     * @param {AdminBillingApiAdminBillingControllerResolvePostErasureChargeV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    adminBillingControllerResolvePostErasureChargeV1(
      requestParameters: AdminBillingApiAdminBillingControllerResolvePostErasureChargeV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .adminBillingControllerResolvePostErasureChargeV1(
          requestParameters.receiptId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * AdminBillingApi - interface
 */
export interface AdminBillingApiInterface {
  /**
   * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, and at-risk (past-due) subscriptions — the one place any of billing_plans/tenant_subscriptions gets an admin-facing read. Webhook activity is a separate, paginated endpoint — see ApiListBillingWebhookEvents.
   * @summary Platform-wide billing statistics
   * @param {AdminBillingApiAdminBillingControllerGetSummaryV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBillingControllerGetSummaryV1(
    requestParameters?: AdminBillingApiAdminBillingControllerGetSummaryV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<AdminBillingSummaryResponseDto>;

  /**
   * A cheap existence check, not the full billing summary — backs the admin frontend\'s Billing nav item / dashboard-route guard, which must stay available whenever at least one tenant is still on Paid, independent of PAYMENT_FEATURE_ENABLED (that flag only gates starting a new checkout, never an already-Paid tenant\'s subscription).
   * @summary Whether any tenant is currently on the Paid plan
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBillingControllerHasPaidTenantsV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<HasPaidTenantsResponseDto>;

  /**
   * The Stripe webhook deliveries (`stripe_webhook_events`) `BillingWebhooksService` actually acts on, newest first, resolved to the tenant its Stripe customer id belongs to where possible (null for an orphan delivery). Every other Stripe event type this app receives and ignores is out of scope for this endpoint entirely — a platform admin has no use for that raw traffic; debugging it is an engineering concern for Stripe\'s own Dashboard event log or backend logs instead. `type` narrows to one exact handled event type, by StripeWebhookEventType\'s own key name rather than the raw Stripe wire string.
   * @summary Paginated, filterable Stripe webhook activity
   * @param {AdminBillingApiAdminBillingControllerListWebhookEventsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBillingControllerListWebhookEventsV1(
    requestParameters?: AdminBillingApiAdminBillingControllerListWebhookEventsV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<BillingWebhookEventListResponseDto>;

  /**
   * Removes one entry from the billing summary\'s `postErasureCharges` queue once an admin has refunded the invoice in Stripe (or decided not to). Records who and when. Does not call Stripe. A repeat, an unknown id and a never-flagged receipt are all 404.
   * @summary Mark a charged-after-deletion-request payment as handled
   * @param {AdminBillingApiAdminBillingControllerResolvePostErasureChargeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  adminBillingControllerResolvePostErasureChargeV1(
    requestParameters: AdminBillingApiAdminBillingControllerResolvePostErasureChargeV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;
}

/**
 * Request parameters for adminBillingControllerGetSummaryV1 operation in AdminBillingApi.
 */
export interface AdminBillingApiAdminBillingControllerGetSummaryV1Request {
  /**
   * How many trailing calendar months the &#x60;upgradeTrend&#x60; series covers, counting back from the current one (inclusive). The other summary figures are all-time, not windowed by this.
   */
  readonly months?: number;
}

/**
 * Request parameters for adminBillingControllerListWebhookEventsV1 operation in AdminBillingApi.
 */
export interface AdminBillingApiAdminBillingControllerListWebhookEventsV1Request {
  readonly page?: number;

  readonly pageSize?: number;

  /**
   * One of StripeWebhookEventType\&#39;s own key names, not Stripe\&#39;s raw dotted wire format — this app\&#39;s own filter vocabulary never leaks Stripe\&#39;s internal naming into a URL. Mapped to the matching raw type internally before it reaches the repository.
   */
  readonly type?: AdminBillingControllerListWebhookEventsV1TypeEnum;
}

/**
 * Request parameters for adminBillingControllerResolvePostErasureChargeV1 operation in AdminBillingApi.
 */
export interface AdminBillingApiAdminBillingControllerResolvePostErasureChargeV1Request {
  /**
   * The &#x60;receiptId&#x60; from &#x60;postErasureCharges&#x60;.
   */
  readonly receiptId: string;
}

/**
 * AdminBillingApi - object-oriented interface
 */
export class AdminBillingApi
  extends BaseAPI
  implements AdminBillingApiInterface
{
  /**
   * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, and at-risk (past-due) subscriptions — the one place any of billing_plans/tenant_subscriptions gets an admin-facing read. Webhook activity is a separate, paginated endpoint — see ApiListBillingWebhookEvents.
   * @summary Platform-wide billing statistics
   * @param {AdminBillingApiAdminBillingControllerGetSummaryV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBillingControllerGetSummaryV1(
    requestParameters: AdminBillingApiAdminBillingControllerGetSummaryV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBillingApiFp(this.configuration)
      .adminBillingControllerGetSummaryV1(requestParameters.months, options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * A cheap existence check, not the full billing summary — backs the admin frontend\'s Billing nav item / dashboard-route guard, which must stay available whenever at least one tenant is still on Paid, independent of PAYMENT_FEATURE_ENABLED (that flag only gates starting a new checkout, never an already-Paid tenant\'s subscription).
   * @summary Whether any tenant is currently on the Paid plan
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBillingControllerHasPaidTenantsV1(
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBillingApiFp(this.configuration)
      .adminBillingControllerHasPaidTenantsV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * The Stripe webhook deliveries (`stripe_webhook_events`) `BillingWebhooksService` actually acts on, newest first, resolved to the tenant its Stripe customer id belongs to where possible (null for an orphan delivery). Every other Stripe event type this app receives and ignores is out of scope for this endpoint entirely — a platform admin has no use for that raw traffic; debugging it is an engineering concern for Stripe\'s own Dashboard event log or backend logs instead. `type` narrows to one exact handled event type, by StripeWebhookEventType\'s own key name rather than the raw Stripe wire string.
   * @summary Paginated, filterable Stripe webhook activity
   * @param {AdminBillingApiAdminBillingControllerListWebhookEventsV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBillingControllerListWebhookEventsV1(
    requestParameters: AdminBillingApiAdminBillingControllerListWebhookEventsV1Request = {},
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBillingApiFp(this.configuration)
      .adminBillingControllerListWebhookEventsV1(
        requestParameters.page,
        requestParameters.pageSize,
        requestParameters.type,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Removes one entry from the billing summary\'s `postErasureCharges` queue once an admin has refunded the invoice in Stripe (or decided not to). Records who and when. Does not call Stripe. A repeat, an unknown id and a never-flagged receipt are all 404.
   * @summary Mark a charged-after-deletion-request payment as handled
   * @param {AdminBillingApiAdminBillingControllerResolvePostErasureChargeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public adminBillingControllerResolvePostErasureChargeV1(
    requestParameters: AdminBillingApiAdminBillingControllerResolvePostErasureChargeV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return AdminBillingApiFp(this.configuration)
      .adminBillingControllerResolvePostErasureChargeV1(
        requestParameters.receiptId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}

export const AdminBillingControllerListWebhookEventsV1TypeEnum = {
  CheckoutSessionCompleted: 'CHECKOUT_SESSION_COMPLETED',
  SubscriptionUpdated: 'SUBSCRIPTION_UPDATED',
  SubscriptionDeleted: 'SUBSCRIPTION_DELETED',
  InvoicePaymentFailed: 'INVOICE_PAYMENT_FAILED',
  InvoicePaymentSucceeded: 'INVOICE_PAYMENT_SUCCEEDED',
} as const;
export type AdminBillingControllerListWebhookEventsV1TypeEnum =
  (typeof AdminBillingControllerListWebhookEventsV1TypeEnum)[keyof typeof AdminBillingControllerListWebhookEventsV1TypeEnum];
