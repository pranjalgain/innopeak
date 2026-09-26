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
import type { HasPaidTenantsResponseDto } from '../models';
/**
 * AdminBillingApi - axios parameter creator
 */
export const AdminBillingApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, at-risk (past-due) subscriptions and recent Stripe webhook activity — the one place any of billing_plans/tenant_subscriptions/stripe_webhook_events gets an admin-facing read.
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
     * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, at-risk (past-due) subscriptions and recent Stripe webhook activity — the one place any of billing_plans/tenant_subscriptions/stripe_webhook_events gets an admin-facing read.
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
     * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, at-risk (past-due) subscriptions and recent Stripe webhook activity — the one place any of billing_plans/tenant_subscriptions/stripe_webhook_events gets an admin-facing read.
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
  };
};

/**
 * AdminBillingApi - interface
 */
export interface AdminBillingApiInterface {
  /**
   * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, at-risk (past-due) subscriptions and recent Stripe webhook activity — the one place any of billing_plans/tenant_subscriptions/stripe_webhook_events gets an admin-facing read.
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
 * AdminBillingApi - object-oriented interface
 */
export class AdminBillingApi
  extends BaseAPI
  implements AdminBillingApiInterface
{
  /**
   * Plan split, subscription status breakdown, Free-to-Paid upgrade trend, at-risk (past-due) subscriptions and recent Stripe webhook activity — the one place any of billing_plans/tenant_subscriptions/stripe_webhook_events gets an admin-facing read.
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
}
