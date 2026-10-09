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
import type { BillingPlansResponseDto } from '../models';
// @ts-ignore
import type { BillingProfileResponseDto } from '../models';
// @ts-ignore
import type { ReceiptListResponseDto } from '../models';
// @ts-ignore
import type { ReconcileCheckoutSessionDto } from '../models';
// @ts-ignore
import type { RedirectUrlResponseDto } from '../models';
// @ts-ignore
import type { SetActiveLocationDto } from '../models';
// @ts-ignore
import type { SetDefaultPaymentMethodDto } from '../models';
// @ts-ignore
import type { SetupIntentResponseDto } from '../models';
// @ts-ignore
import type { SubscriptionResponseDto } from '../models';
// @ts-ignore
import type { UpdateBillingProfileDto } from '../models';
/**
 * BillingApi - axios parameter creator
 */
export const BillingApiAxiosParamCreator = function (
  configuration?: Configuration,
) {
  return {
    /**
     * In-app cancellation — no redirect to a hosted portal. Calls the active payment provider directly; the plan stays Paid with full entitlements until the current billing period actually ends, matching what a real Stripe Customer Portal cancellation would leave the subscription in. Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant always keeps the ability to cancel.
     * @summary Cancel the caller tenant\'s subscription at the end of the current period
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCancelSubscriptionV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/cancel`;
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
     * Creates (or reuses) a payment-provider customer for this tenant and starts a subscription Checkout session. Gated on PAYMENT_FEATURE_ENABLED — see BILLING_NOT_ENABLED.
     * @summary Create a Checkout session to upgrade to Paid
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCreateCheckoutSessionV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/checkout`;
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
     * Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant keeps full access to manage or cancel their subscription regardless of the deploy-level switch.
     * @summary Create a Customer Portal session to manage/cancel billing
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCreatePortalSessionV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/portal`;
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
     * Creates a Stripe SetupIntent and returns its client secret for Stripe Elements to confirm in the browser — the raw card never reaches this backend. Stripe-only. Confirming the SetupIntent client-side does not itself make the new card the default; call PUT /v1/billing/payment-method afterward with the resulting payment method id.
     * @summary Start adding/replacing the card on file
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCreateSetupIntentV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/setup-intent`;
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
     * Rendered on demand, not stored — the PDF is generated fresh from the billing_receipts row each call. Scoped to the caller\'s own tenant; a receipt id that doesn\'t exist or belongs to a different tenant both 404 as RECEIPT_NOT_FOUND.
     * @summary Download a PDF receipt for one past payment
     * @param {string} receiptId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerDownloadReceiptPdfV1: async (
      receiptId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'receiptId' is not null or undefined
      assertParamExists(
        'billingControllerDownloadReceiptPdfV1',
        'receiptId',
        receiptId,
      );
      const localVarPath = `/v1/billing/receipts/{receiptId}/pdf`.replace(
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
        method: 'GET',
        ...baseOptions,
        ...options,
      };
      const localVarHeaderParameter = {} as any;
      const localVarQueryParameter = {} as any;

      // authentication bearer required
      // http bearer authentication required
      await setBearerAuthToObject(localVarHeaderParameter, configuration);

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
     * Reads name/email directly off the Stripe Customer object — in-app replacement for the hosted Customer Portal. Stripe-only.
     * @summary Get the caller tenant\'s Stripe billing profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerGetBillingProfileV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/profile`;
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
     * Current plan, Stripe subscription state (if any), and live entitlement usage against the plan.
     * @summary Get the caller tenant\'s subscription
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerGetSubscriptionV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/subscription`;
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
     * Returns both plans (Free/Paid) plus the caller tenant\'s current plan id.
     * @summary List billing plans
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerListPlansV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/plans`;
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
     * One row per successfully paid Stripe invoice — empty for a tenant who has never made a real payment. See 0012_billing_receipts.sql.
     * @summary List the caller tenant\'s payment receipts
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerListReceiptsV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/billing/receipts`;
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
     * Reads the given Checkout Session straight from Stripe and applies it if it has a subscription on it yet — recovers the tenant\'s billing status even if checkout.session.completed was delayed or never arrived. Call this once when the browser lands back on the success page with the session_id Stripe appended to success_url. Safe to call more than once, and safe to call even after the webhook already landed.
     * @summary Reconcile billing status against a Checkout session
     * @param {ReconcileCheckoutSessionDto} reconcileCheckoutSessionDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerReconcileCheckoutSessionV1: async (
      reconcileCheckoutSessionDto: ReconcileCheckoutSessionDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'reconcileCheckoutSessionDto' is not null or undefined
      assertParamExists(
        'billingControllerReconcileCheckoutSessionV1',
        'reconcileCheckoutSessionDto',
        reconcileCheckoutSessionDto,
      );
      const localVarPath = `/v1/billing/checkout/reconcile`;
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
        reconcileCheckoutSessionDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Only meaningful when the tenant has more connected locations than their plan allows — atomically pauses every other location and unpauses the chosen one.
     * @summary Choose which connected location stays active under the current plan cap
     * @param {SetActiveLocationDto} setActiveLocationDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerSetActiveLocationV1: async (
      setActiveLocationDto: SetActiveLocationDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'setActiveLocationDto' is not null or undefined
      assertParamExists(
        'billingControllerSetActiveLocationV1',
        'setActiveLocationDto',
        setActiveLocationDto,
      );
      const localVarPath = `/v1/billing/active-location`;
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
    /**
     * Call this right after Stripe.js confirms the SetupIntent from POST /v1/billing/setup-intent, passing the payment method id it returned. Stripe-only.
     * @summary Make a just-confirmed SetupIntent payment method the default card
     * @param {SetDefaultPaymentMethodDto} setDefaultPaymentMethodDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerSetDefaultPaymentMethodV1: async (
      setDefaultPaymentMethodDto: SetDefaultPaymentMethodDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'setDefaultPaymentMethodDto' is not null or undefined
      assertParamExists(
        'billingControllerSetDefaultPaymentMethodV1',
        'setDefaultPaymentMethodDto',
        setDefaultPaymentMethodDto,
      );
      const localVarPath = `/v1/billing/payment-method`;
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

      setSearchParams(localVarUrlObj, localVarQueryParameter);
      let headersFromBaseOptions =
        baseOptions && baseOptions.headers ? baseOptions.headers : {};
      localVarRequestOptions.headers = {
        ...localVarHeaderParameter,
        ...headersFromBaseOptions,
        ...options.headers,
      };
      localVarRequestOptions.data = serializeDataIfNeeded(
        setDefaultPaymentMethodDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Writes name/email directly onto the Stripe Customer object. Stripe-only.
     * @summary Update the caller tenant\'s Stripe billing profile
     * @param {UpdateBillingProfileDto} updateBillingProfileDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerUpdateBillingProfileV1: async (
      updateBillingProfileDto: UpdateBillingProfileDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'updateBillingProfileDto' is not null or undefined
      assertParamExists(
        'billingControllerUpdateBillingProfileV1',
        'updateBillingProfileDto',
        updateBillingProfileDto,
      );
      const localVarPath = `/v1/billing/profile`;
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
        updateBillingProfileDto,
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
 * BillingApi - functional programming interface
 */
export const BillingApiFp = function (configuration?: Configuration) {
  const localVarAxiosParamCreator = BillingApiAxiosParamCreator(configuration);
  return {
    /**
     * In-app cancellation — no redirect to a hosted portal. Calls the active payment provider directly; the plan stays Paid with full entitlements until the current billing period actually ends, matching what a real Stripe Customer Portal cancellation would leave the subscription in. Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant always keeps the ability to cancel.
     * @summary Cancel the caller tenant\'s subscription at the end of the current period
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerCancelSubscriptionV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerCancelSubscriptionV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'BillingApi.billingControllerCancelSubscriptionV1'
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
     * Creates (or reuses) a payment-provider customer for this tenant and starts a subscription Checkout session. Gated on PAYMENT_FEATURE_ENABLED — see BILLING_NOT_ENABLED.
     * @summary Create a Checkout session to upgrade to Paid
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerCreateCheckoutSessionV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<RedirectUrlResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerCreateCheckoutSessionV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'BillingApi.billingControllerCreateCheckoutSessionV1'
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
     * Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant keeps full access to manage or cancel their subscription regardless of the deploy-level switch.
     * @summary Create a Customer Portal session to manage/cancel billing
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerCreatePortalSessionV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<RedirectUrlResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerCreatePortalSessionV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'BillingApi.billingControllerCreatePortalSessionV1'
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
     * Creates a Stripe SetupIntent and returns its client secret for Stripe Elements to confirm in the browser — the raw card never reaches this backend. Stripe-only. Confirming the SetupIntent client-side does not itself make the new card the default; call PUT /v1/billing/payment-method afterward with the resulting payment method id.
     * @summary Start adding/replacing the card on file
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerCreateSetupIntentV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<SetupIntentResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerCreateSetupIntentV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['BillingApi.billingControllerCreateSetupIntentV1']?.[
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
     * Rendered on demand, not stored — the PDF is generated fresh from the billing_receipts row each call. Scoped to the caller\'s own tenant; a receipt id that doesn\'t exist or belongs to a different tenant both 404 as RECEIPT_NOT_FOUND.
     * @summary Download a PDF receipt for one past payment
     * @param {string} receiptId
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerDownloadReceiptPdfV1(
      receiptId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerDownloadReceiptPdfV1(
          receiptId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'BillingApi.billingControllerDownloadReceiptPdfV1'
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
     * Reads name/email directly off the Stripe Customer object — in-app replacement for the hosted Customer Portal. Stripe-only.
     * @summary Get the caller tenant\'s Stripe billing profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerGetBillingProfileV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<BillingProfileResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerGetBillingProfileV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['BillingApi.billingControllerGetBillingProfileV1']?.[
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
     * Current plan, Stripe subscription state (if any), and live entitlement usage against the plan.
     * @summary Get the caller tenant\'s subscription
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerGetSubscriptionV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<SubscriptionResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerGetSubscriptionV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['BillingApi.billingControllerGetSubscriptionV1']?.[
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
     * Returns both plans (Free/Paid) plus the caller tenant\'s current plan id.
     * @summary List billing plans
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerListPlansV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<BillingPlansResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerListPlansV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['BillingApi.billingControllerListPlansV1']?.[
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
     * One row per successfully paid Stripe invoice — empty for a tenant who has never made a real payment. See 0012_billing_receipts.sql.
     * @summary List the caller tenant\'s payment receipts
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerListReceiptsV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<ReceiptListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerListReceiptsV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['BillingApi.billingControllerListReceiptsV1']?.[
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
     * Reads the given Checkout Session straight from Stripe and applies it if it has a subscription on it yet — recovers the tenant\'s billing status even if checkout.session.completed was delayed or never arrived. Call this once when the browser lands back on the success page with the session_id Stripe appended to success_url. Safe to call more than once, and safe to call even after the webhook already landed.
     * @summary Reconcile billing status against a Checkout session
     * @param {ReconcileCheckoutSessionDto} reconcileCheckoutSessionDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerReconcileCheckoutSessionV1(
      reconcileCheckoutSessionDto: ReconcileCheckoutSessionDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<SubscriptionResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerReconcileCheckoutSessionV1(
          reconcileCheckoutSessionDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'BillingApi.billingControllerReconcileCheckoutSessionV1'
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
     * Only meaningful when the tenant has more connected locations than their plan allows — atomically pauses every other location and unpauses the chosen one.
     * @summary Choose which connected location stays active under the current plan cap
     * @param {SetActiveLocationDto} setActiveLocationDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerSetActiveLocationV1(
      setActiveLocationDto: SetActiveLocationDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerSetActiveLocationV1(
          setActiveLocationDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['BillingApi.billingControllerSetActiveLocationV1']?.[
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
     * Call this right after Stripe.js confirms the SetupIntent from POST /v1/billing/setup-intent, passing the payment method id it returned. Stripe-only.
     * @summary Make a just-confirmed SetupIntent payment method the default card
     * @param {SetDefaultPaymentMethodDto} setDefaultPaymentMethodDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerSetDefaultPaymentMethodV1(
      setDefaultPaymentMethodDto: SetDefaultPaymentMethodDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (axios?: AxiosInstance, basePath?: string) => AxiosPromise<void>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerSetDefaultPaymentMethodV1(
          setDefaultPaymentMethodDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'BillingApi.billingControllerSetDefaultPaymentMethodV1'
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
     * Writes name/email directly onto the Stripe Customer object. Stripe-only.
     * @summary Update the caller tenant\'s Stripe billing profile
     * @param {UpdateBillingProfileDto} updateBillingProfileDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async billingControllerUpdateBillingProfileV1(
      updateBillingProfileDto: UpdateBillingProfileDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<BillingProfileResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.billingControllerUpdateBillingProfileV1(
          updateBillingProfileDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'BillingApi.billingControllerUpdateBillingProfileV1'
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
 * BillingApi - factory interface
 */
export const BillingApiFactory = function (
  configuration?: Configuration,
  basePath?: string,
  axios?: AxiosInstance,
) {
  const localVarFp = BillingApiFp(configuration);
  return {
    /**
     * In-app cancellation — no redirect to a hosted portal. Calls the active payment provider directly; the plan stays Paid with full entitlements until the current billing period actually ends, matching what a real Stripe Customer Portal cancellation would leave the subscription in. Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant always keeps the ability to cancel.
     * @summary Cancel the caller tenant\'s subscription at the end of the current period
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCancelSubscriptionV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .billingControllerCancelSubscriptionV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Creates (or reuses) a payment-provider customer for this tenant and starts a subscription Checkout session. Gated on PAYMENT_FEATURE_ENABLED — see BILLING_NOT_ENABLED.
     * @summary Create a Checkout session to upgrade to Paid
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCreateCheckoutSessionV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<RedirectUrlResponseDto> {
      return localVarFp
        .billingControllerCreateCheckoutSessionV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant keeps full access to manage or cancel their subscription regardless of the deploy-level switch.
     * @summary Create a Customer Portal session to manage/cancel billing
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCreatePortalSessionV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<RedirectUrlResponseDto> {
      return localVarFp
        .billingControllerCreatePortalSessionV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Creates a Stripe SetupIntent and returns its client secret for Stripe Elements to confirm in the browser — the raw card never reaches this backend. Stripe-only. Confirming the SetupIntent client-side does not itself make the new card the default; call PUT /v1/billing/payment-method afterward with the resulting payment method id.
     * @summary Start adding/replacing the card on file
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerCreateSetupIntentV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<SetupIntentResponseDto> {
      return localVarFp
        .billingControllerCreateSetupIntentV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Rendered on demand, not stored — the PDF is generated fresh from the billing_receipts row each call. Scoped to the caller\'s own tenant; a receipt id that doesn\'t exist or belongs to a different tenant both 404 as RECEIPT_NOT_FOUND.
     * @summary Download a PDF receipt for one past payment
     * @param {BillingApiBillingControllerDownloadReceiptPdfV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerDownloadReceiptPdfV1(
      requestParameters: BillingApiBillingControllerDownloadReceiptPdfV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .billingControllerDownloadReceiptPdfV1(
          requestParameters.receiptId,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Reads name/email directly off the Stripe Customer object — in-app replacement for the hosted Customer Portal. Stripe-only.
     * @summary Get the caller tenant\'s Stripe billing profile
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerGetBillingProfileV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<BillingProfileResponseDto> {
      return localVarFp
        .billingControllerGetBillingProfileV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Current plan, Stripe subscription state (if any), and live entitlement usage against the plan.
     * @summary Get the caller tenant\'s subscription
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerGetSubscriptionV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<SubscriptionResponseDto> {
      return localVarFp
        .billingControllerGetSubscriptionV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Returns both plans (Free/Paid) plus the caller tenant\'s current plan id.
     * @summary List billing plans
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerListPlansV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<BillingPlansResponseDto> {
      return localVarFp
        .billingControllerListPlansV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * One row per successfully paid Stripe invoice — empty for a tenant who has never made a real payment. See 0012_billing_receipts.sql.
     * @summary List the caller tenant\'s payment receipts
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerListReceiptsV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<ReceiptListResponseDto> {
      return localVarFp
        .billingControllerListReceiptsV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Reads the given Checkout Session straight from Stripe and applies it if it has a subscription on it yet — recovers the tenant\'s billing status even if checkout.session.completed was delayed or never arrived. Call this once when the browser lands back on the success page with the session_id Stripe appended to success_url. Safe to call more than once, and safe to call even after the webhook already landed.
     * @summary Reconcile billing status against a Checkout session
     * @param {BillingApiBillingControllerReconcileCheckoutSessionV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerReconcileCheckoutSessionV1(
      requestParameters: BillingApiBillingControllerReconcileCheckoutSessionV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<SubscriptionResponseDto> {
      return localVarFp
        .billingControllerReconcileCheckoutSessionV1(
          requestParameters.reconcileCheckoutSessionDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Only meaningful when the tenant has more connected locations than their plan allows — atomically pauses every other location and unpauses the chosen one.
     * @summary Choose which connected location stays active under the current plan cap
     * @param {BillingApiBillingControllerSetActiveLocationV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerSetActiveLocationV1(
      requestParameters: BillingApiBillingControllerSetActiveLocationV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .billingControllerSetActiveLocationV1(
          requestParameters.setActiveLocationDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Call this right after Stripe.js confirms the SetupIntent from POST /v1/billing/setup-intent, passing the payment method id it returned. Stripe-only.
     * @summary Make a just-confirmed SetupIntent payment method the default card
     * @param {BillingApiBillingControllerSetDefaultPaymentMethodV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerSetDefaultPaymentMethodV1(
      requestParameters: BillingApiBillingControllerSetDefaultPaymentMethodV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<void> {
      return localVarFp
        .billingControllerSetDefaultPaymentMethodV1(
          requestParameters.setDefaultPaymentMethodDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Writes name/email directly onto the Stripe Customer object. Stripe-only.
     * @summary Update the caller tenant\'s Stripe billing profile
     * @param {BillingApiBillingControllerUpdateBillingProfileV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    billingControllerUpdateBillingProfileV1(
      requestParameters: BillingApiBillingControllerUpdateBillingProfileV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<BillingProfileResponseDto> {
      return localVarFp
        .billingControllerUpdateBillingProfileV1(
          requestParameters.updateBillingProfileDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
  };
};

/**
 * BillingApi - interface
 */
export interface BillingApiInterface {
  /**
   * In-app cancellation — no redirect to a hosted portal. Calls the active payment provider directly; the plan stays Paid with full entitlements until the current billing period actually ends, matching what a real Stripe Customer Portal cancellation would leave the subscription in. Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant always keeps the ability to cancel.
   * @summary Cancel the caller tenant\'s subscription at the end of the current period
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerCancelSubscriptionV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Creates (or reuses) a payment-provider customer for this tenant and starts a subscription Checkout session. Gated on PAYMENT_FEATURE_ENABLED — see BILLING_NOT_ENABLED.
   * @summary Create a Checkout session to upgrade to Paid
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerCreateCheckoutSessionV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<RedirectUrlResponseDto>;

  /**
   * Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant keeps full access to manage or cancel their subscription regardless of the deploy-level switch.
   * @summary Create a Customer Portal session to manage/cancel billing
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerCreatePortalSessionV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<RedirectUrlResponseDto>;

  /**
   * Creates a Stripe SetupIntent and returns its client secret for Stripe Elements to confirm in the browser — the raw card never reaches this backend. Stripe-only. Confirming the SetupIntent client-side does not itself make the new card the default; call PUT /v1/billing/payment-method afterward with the resulting payment method id.
   * @summary Start adding/replacing the card on file
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerCreateSetupIntentV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<SetupIntentResponseDto>;

  /**
   * Rendered on demand, not stored — the PDF is generated fresh from the billing_receipts row each call. Scoped to the caller\'s own tenant; a receipt id that doesn\'t exist or belongs to a different tenant both 404 as RECEIPT_NOT_FOUND.
   * @summary Download a PDF receipt for one past payment
   * @param {BillingApiBillingControllerDownloadReceiptPdfV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerDownloadReceiptPdfV1(
    requestParameters: BillingApiBillingControllerDownloadReceiptPdfV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Reads name/email directly off the Stripe Customer object — in-app replacement for the hosted Customer Portal. Stripe-only.
   * @summary Get the caller tenant\'s Stripe billing profile
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerGetBillingProfileV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<BillingProfileResponseDto>;

  /**
   * Current plan, Stripe subscription state (if any), and live entitlement usage against the plan.
   * @summary Get the caller tenant\'s subscription
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerGetSubscriptionV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<SubscriptionResponseDto>;

  /**
   * Returns both plans (Free/Paid) plus the caller tenant\'s current plan id.
   * @summary List billing plans
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerListPlansV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<BillingPlansResponseDto>;

  /**
   * One row per successfully paid Stripe invoice — empty for a tenant who has never made a real payment. See 0012_billing_receipts.sql.
   * @summary List the caller tenant\'s payment receipts
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerListReceiptsV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<ReceiptListResponseDto>;

  /**
   * Reads the given Checkout Session straight from Stripe and applies it if it has a subscription on it yet — recovers the tenant\'s billing status even if checkout.session.completed was delayed or never arrived. Call this once when the browser lands back on the success page with the session_id Stripe appended to success_url. Safe to call more than once, and safe to call even after the webhook already landed.
   * @summary Reconcile billing status against a Checkout session
   * @param {BillingApiBillingControllerReconcileCheckoutSessionV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerReconcileCheckoutSessionV1(
    requestParameters: BillingApiBillingControllerReconcileCheckoutSessionV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<SubscriptionResponseDto>;

  /**
   * Only meaningful when the tenant has more connected locations than their plan allows — atomically pauses every other location and unpauses the chosen one.
   * @summary Choose which connected location stays active under the current plan cap
   * @param {BillingApiBillingControllerSetActiveLocationV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerSetActiveLocationV1(
    requestParameters: BillingApiBillingControllerSetActiveLocationV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Call this right after Stripe.js confirms the SetupIntent from POST /v1/billing/setup-intent, passing the payment method id it returned. Stripe-only.
   * @summary Make a just-confirmed SetupIntent payment method the default card
   * @param {BillingApiBillingControllerSetDefaultPaymentMethodV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerSetDefaultPaymentMethodV1(
    requestParameters: BillingApiBillingControllerSetDefaultPaymentMethodV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<void>;

  /**
   * Writes name/email directly onto the Stripe Customer object. Stripe-only.
   * @summary Update the caller tenant\'s Stripe billing profile
   * @param {BillingApiBillingControllerUpdateBillingProfileV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  billingControllerUpdateBillingProfileV1(
    requestParameters: BillingApiBillingControllerUpdateBillingProfileV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<BillingProfileResponseDto>;
}

/**
 * Request parameters for billingControllerDownloadReceiptPdfV1 operation in BillingApi.
 */
export interface BillingApiBillingControllerDownloadReceiptPdfV1Request {
  readonly receiptId: string;
}

/**
 * Request parameters for billingControllerReconcileCheckoutSessionV1 operation in BillingApi.
 */
export interface BillingApiBillingControllerReconcileCheckoutSessionV1Request {
  readonly reconcileCheckoutSessionDto: ReconcileCheckoutSessionDto;
}

/**
 * Request parameters for billingControllerSetActiveLocationV1 operation in BillingApi.
 */
export interface BillingApiBillingControllerSetActiveLocationV1Request {
  readonly setActiveLocationDto: SetActiveLocationDto;
}

/**
 * Request parameters for billingControllerSetDefaultPaymentMethodV1 operation in BillingApi.
 */
export interface BillingApiBillingControllerSetDefaultPaymentMethodV1Request {
  readonly setDefaultPaymentMethodDto: SetDefaultPaymentMethodDto;
}

/**
 * Request parameters for billingControllerUpdateBillingProfileV1 operation in BillingApi.
 */
export interface BillingApiBillingControllerUpdateBillingProfileV1Request {
  readonly updateBillingProfileDto: UpdateBillingProfileDto;
}

/**
 * BillingApi - object-oriented interface
 */
export class BillingApi extends BaseAPI implements BillingApiInterface {
  /**
   * In-app cancellation — no redirect to a hosted portal. Calls the active payment provider directly; the plan stays Paid with full entitlements until the current billing period actually ends, matching what a real Stripe Customer Portal cancellation would leave the subscription in. Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant always keeps the ability to cancel.
   * @summary Cancel the caller tenant\'s subscription at the end of the current period
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerCancelSubscriptionV1(
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerCancelSubscriptionV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Creates (or reuses) a payment-provider customer for this tenant and starts a subscription Checkout session. Gated on PAYMENT_FEATURE_ENABLED — see BILLING_NOT_ENABLED.
   * @summary Create a Checkout session to upgrade to Paid
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerCreateCheckoutSessionV1(
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerCreateCheckoutSessionV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant keeps full access to manage or cancel their subscription regardless of the deploy-level switch.
   * @summary Create a Customer Portal session to manage/cancel billing
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerCreatePortalSessionV1(
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerCreatePortalSessionV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Creates a Stripe SetupIntent and returns its client secret for Stripe Elements to confirm in the browser — the raw card never reaches this backend. Stripe-only. Confirming the SetupIntent client-side does not itself make the new card the default; call PUT /v1/billing/payment-method afterward with the resulting payment method id.
   * @summary Start adding/replacing the card on file
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerCreateSetupIntentV1(options?: RawAxiosRequestConfig) {
    return BillingApiFp(this.configuration)
      .billingControllerCreateSetupIntentV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Rendered on demand, not stored — the PDF is generated fresh from the billing_receipts row each call. Scoped to the caller\'s own tenant; a receipt id that doesn\'t exist or belongs to a different tenant both 404 as RECEIPT_NOT_FOUND.
   * @summary Download a PDF receipt for one past payment
   * @param {BillingApiBillingControllerDownloadReceiptPdfV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerDownloadReceiptPdfV1(
    requestParameters: BillingApiBillingControllerDownloadReceiptPdfV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerDownloadReceiptPdfV1(
        requestParameters.receiptId,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Reads name/email directly off the Stripe Customer object — in-app replacement for the hosted Customer Portal. Stripe-only.
   * @summary Get the caller tenant\'s Stripe billing profile
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerGetBillingProfileV1(options?: RawAxiosRequestConfig) {
    return BillingApiFp(this.configuration)
      .billingControllerGetBillingProfileV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Current plan, Stripe subscription state (if any), and live entitlement usage against the plan.
   * @summary Get the caller tenant\'s subscription
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerGetSubscriptionV1(options?: RawAxiosRequestConfig) {
    return BillingApiFp(this.configuration)
      .billingControllerGetSubscriptionV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Returns both plans (Free/Paid) plus the caller tenant\'s current plan id.
   * @summary List billing plans
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerListPlansV1(options?: RawAxiosRequestConfig) {
    return BillingApiFp(this.configuration)
      .billingControllerListPlansV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * One row per successfully paid Stripe invoice — empty for a tenant who has never made a real payment. See 0012_billing_receipts.sql.
   * @summary List the caller tenant\'s payment receipts
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerListReceiptsV1(options?: RawAxiosRequestConfig) {
    return BillingApiFp(this.configuration)
      .billingControllerListReceiptsV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Reads the given Checkout Session straight from Stripe and applies it if it has a subscription on it yet — recovers the tenant\'s billing status even if checkout.session.completed was delayed or never arrived. Call this once when the browser lands back on the success page with the session_id Stripe appended to success_url. Safe to call more than once, and safe to call even after the webhook already landed.
   * @summary Reconcile billing status against a Checkout session
   * @param {BillingApiBillingControllerReconcileCheckoutSessionV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerReconcileCheckoutSessionV1(
    requestParameters: BillingApiBillingControllerReconcileCheckoutSessionV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerReconcileCheckoutSessionV1(
        requestParameters.reconcileCheckoutSessionDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Only meaningful when the tenant has more connected locations than their plan allows — atomically pauses every other location and unpauses the chosen one.
   * @summary Choose which connected location stays active under the current plan cap
   * @param {BillingApiBillingControllerSetActiveLocationV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerSetActiveLocationV1(
    requestParameters: BillingApiBillingControllerSetActiveLocationV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerSetActiveLocationV1(
        requestParameters.setActiveLocationDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Call this right after Stripe.js confirms the SetupIntent from POST /v1/billing/setup-intent, passing the payment method id it returned. Stripe-only.
   * @summary Make a just-confirmed SetupIntent payment method the default card
   * @param {BillingApiBillingControllerSetDefaultPaymentMethodV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerSetDefaultPaymentMethodV1(
    requestParameters: BillingApiBillingControllerSetDefaultPaymentMethodV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerSetDefaultPaymentMethodV1(
        requestParameters.setDefaultPaymentMethodDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Writes name/email directly onto the Stripe Customer object. Stripe-only.
   * @summary Update the caller tenant\'s Stripe billing profile
   * @param {BillingApiBillingControllerUpdateBillingProfileV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public billingControllerUpdateBillingProfileV1(
    requestParameters: BillingApiBillingControllerUpdateBillingProfileV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return BillingApiFp(this.configuration)
      .billingControllerUpdateBillingProfileV1(
        requestParameters.updateBillingProfileDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }
}
