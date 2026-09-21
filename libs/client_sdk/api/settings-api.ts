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
import type { InviteMemberDto } from '../models';
// @ts-ignore
import type { NotificationRecipientDto } from '../models';
// @ts-ignore
import type { NotificationRecipientListResponseDto } from '../models';
// @ts-ignore
import type { PlatformSettingsResponseDto } from '../models';
// @ts-ignore
import type { TenantMemberResponseDto } from '../models';
// @ts-ignore
import type { TenantMembersControllerRevokeV1200Response } from '../models';
// @ts-ignore
import type { TenantSettingsResponseDto } from '../models';
// @ts-ignore
import type { UpdateNotificationRecipientDto } from '../models';
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
     * Owner-only. Every `notification_recipients` row for this tenant, joined to `users` for name/initials. Seeded with exactly one row (the signing-up owner) at signup — there is no add-recipient route yet, matching the shipped Settings UI, which only edits existing rows.
     * @summary List escalation notification recipients
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationRecipientsControllerListV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/settings/notification-recipients`;
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
     * Changes `channel` and/or `isActive` for one recipient. Both fields optional, but at least one is required — matches the Settings UI’s channel toggle and active switch, which fire independently. `userId` is never editable here: repointing a recipient row at a different user is a remove-and-re-add, not an update.
     * @summary Update a notification recipient
     * @param {string} recipientId
     * @param {UpdateNotificationRecipientDto} updateNotificationRecipientDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationRecipientsControllerUpdateV1: async (
      recipientId: string,
      updateNotificationRecipientDto: UpdateNotificationRecipientDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'recipientId' is not null or undefined
      assertParamExists(
        'notificationRecipientsControllerUpdateV1',
        'recipientId',
        recipientId,
      );
      // verify required parameter 'updateNotificationRecipientDto' is not null or undefined
      assertParamExists(
        'notificationRecipientsControllerUpdateV1',
        'updateNotificationRecipientDto',
        updateNotificationRecipientDto,
      );
      const localVarPath =
        `/v1/settings/notification-recipients/{recipientId}`.replace(
          '{recipientId}',
          encodeURIComponent(String(recipientId)),
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
        updateNotificationRecipientDto,
        localVarRequestOptions,
        configuration,
      );

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
     * Creates the invited member\'s own row (`status: \"invited\"`, no password, `role: \"member\"`) and a 7-day invite token, then emails the invite link. Refused with 403 while `platform_settings.invite_members_enabled` is off.
     * @summary Invite a teammate
     * @param {InviteMemberDto} inviteMemberDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantMembersControllerInviteV1: async (
      inviteMemberDto: InviteMemberDto,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'inviteMemberDto' is not null or undefined
      assertParamExists(
        'tenantMembersControllerInviteV1',
        'inviteMemberDto',
        inviteMemberDto,
      );
      const localVarPath = `/v1/settings/members`;
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
        inviteMemberDto,
        localVarRequestOptions,
        configuration,
      );

      return {
        url: toPathString(localVarUrlObj),
        options: localVarRequestOptions,
      };
    },
    /**
     * Every `users` row for the caller\'s own tenant — the owner (created at signup, never invited) and every member, invited or active. Oldest-first, so the owner leads the list.
     * @summary List this tenant\'s team, owner included
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantMembersControllerListV1: async (
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      const localVarPath = `/v1/settings/members`;
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
     * Deletes the invited member\'s row outright — only while it is still `invited`. A member who has already accepted cannot be removed through this route.
     * @summary Revoke a pending invite
     * @param {string} memberId The invited member\&#39;s &#x60;users.id&#x60;
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantMembersControllerRevokeV1: async (
      memberId: string,
      options: RawAxiosRequestConfig = {},
    ): Promise<RequestArgs> => {
      // verify required parameter 'memberId' is not null or undefined
      assertParamExists(
        'tenantMembersControllerRevokeV1',
        'memberId',
        memberId,
      );
      const localVarPath = `/v1/settings/members/{memberId}`.replace(
        '{memberId}',
        encodeURIComponent(String(memberId)),
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
     * Owner-only. Every `notification_recipients` row for this tenant, joined to `users` for name/initials. Seeded with exactly one row (the signing-up owner) at signup — there is no add-recipient route yet, matching the shipped Settings UI, which only edits existing rows.
     * @summary List escalation notification recipients
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async notificationRecipientsControllerListV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<NotificationRecipientListResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.notificationRecipientsControllerListV1(
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'SettingsApi.notificationRecipientsControllerListV1'
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
     * Changes `channel` and/or `isActive` for one recipient. Both fields optional, but at least one is required — matches the Settings UI’s channel toggle and active switch, which fire independently. `userId` is never editable here: repointing a recipient row at a different user is a remove-and-re-add, not an update.
     * @summary Update a notification recipient
     * @param {string} recipientId
     * @param {UpdateNotificationRecipientDto} updateNotificationRecipientDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async notificationRecipientsControllerUpdateV1(
      recipientId: string,
      updateNotificationRecipientDto: UpdateNotificationRecipientDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<NotificationRecipientDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.notificationRecipientsControllerUpdateV1(
          recipientId,
          updateNotificationRecipientDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap[
          'SettingsApi.notificationRecipientsControllerUpdateV1'
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
     * Creates the invited member\'s own row (`status: \"invited\"`, no password, `role: \"member\"`) and a 7-day invite token, then emails the invite link. Refused with 403 while `platform_settings.invite_members_enabled` is off.
     * @summary Invite a teammate
     * @param {InviteMemberDto} inviteMemberDto
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async tenantMembersControllerInviteV1(
      inviteMemberDto: InviteMemberDto,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TenantMemberResponseDto>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.tenantMembersControllerInviteV1(
          inviteMemberDto,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.tenantMembersControllerInviteV1']?.[
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
     * Every `users` row for the caller\'s own tenant — the owner (created at signup, never invited) and every member, invited or active. Oldest-first, so the owner leads the list.
     * @summary List this tenant\'s team, owner included
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async tenantMembersControllerListV1(
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<Array<TenantMemberResponseDto>>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.tenantMembersControllerListV1(options);
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.tenantMembersControllerListV1']?.[
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
     * Deletes the invited member\'s row outright — only while it is still `invited`. A member who has already accepted cannot be removed through this route.
     * @summary Revoke a pending invite
     * @param {string} memberId The invited member\&#39;s &#x60;users.id&#x60;
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    async tenantMembersControllerRevokeV1(
      memberId: string,
      options?: RawAxiosRequestConfig,
    ): Promise<
      (
        axios?: AxiosInstance,
        basePath?: string,
      ) => AxiosPromise<TenantMembersControllerRevokeV1200Response>
    > {
      const localVarAxiosArgs =
        await localVarAxiosParamCreator.tenantMembersControllerRevokeV1(
          memberId,
          options,
        );
      const localVarOperationServerIndex = configuration?.serverIndex ?? 0;
      const localVarOperationServerBasePath =
        operationServerMap['SettingsApi.tenantMembersControllerRevokeV1']?.[
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
     * Owner-only. Every `notification_recipients` row for this tenant, joined to `users` for name/initials. Seeded with exactly one row (the signing-up owner) at signup — there is no add-recipient route yet, matching the shipped Settings UI, which only edits existing rows.
     * @summary List escalation notification recipients
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationRecipientsControllerListV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<NotificationRecipientListResponseDto> {
      return localVarFp
        .notificationRecipientsControllerListV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Changes `channel` and/or `isActive` for one recipient. Both fields optional, but at least one is required — matches the Settings UI’s channel toggle and active switch, which fire independently. `userId` is never editable here: repointing a recipient row at a different user is a remove-and-re-add, not an update.
     * @summary Update a notification recipient
     * @param {SettingsApiNotificationRecipientsControllerUpdateV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    notificationRecipientsControllerUpdateV1(
      requestParameters: SettingsApiNotificationRecipientsControllerUpdateV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<NotificationRecipientDto> {
      return localVarFp
        .notificationRecipientsControllerUpdateV1(
          requestParameters.recipientId,
          requestParameters.updateNotificationRecipientDto,
          options,
        )
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
     * Creates the invited member\'s own row (`status: \"invited\"`, no password, `role: \"member\"`) and a 7-day invite token, then emails the invite link. Refused with 403 while `platform_settings.invite_members_enabled` is off.
     * @summary Invite a teammate
     * @param {SettingsApiTenantMembersControllerInviteV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantMembersControllerInviteV1(
      requestParameters: SettingsApiTenantMembersControllerInviteV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TenantMemberResponseDto> {
      return localVarFp
        .tenantMembersControllerInviteV1(
          requestParameters.inviteMemberDto,
          options,
        )
        .then((request) => request(axios, basePath));
    },
    /**
     * Every `users` row for the caller\'s own tenant — the owner (created at signup, never invited) and every member, invited or active. Oldest-first, so the owner leads the list.
     * @summary List this tenant\'s team, owner included
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantMembersControllerListV1(
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<Array<TenantMemberResponseDto>> {
      return localVarFp
        .tenantMembersControllerListV1(options)
        .then((request) => request(axios, basePath));
    },
    /**
     * Deletes the invited member\'s row outright — only while it is still `invited`. A member who has already accepted cannot be removed through this route.
     * @summary Revoke a pending invite
     * @param {SettingsApiTenantMembersControllerRevokeV1Request} requestParameters Request parameters.
     * @param {*} [options] Override http request option.
     * @throws {RequiredError}
     */
    tenantMembersControllerRevokeV1(
      requestParameters: SettingsApiTenantMembersControllerRevokeV1Request,
      options?: RawAxiosRequestConfig,
    ): AxiosPromise<TenantMembersControllerRevokeV1200Response> {
      return localVarFp
        .tenantMembersControllerRevokeV1(requestParameters.memberId, options)
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
   * Owner-only. Every `notification_recipients` row for this tenant, joined to `users` for name/initials. Seeded with exactly one row (the signing-up owner) at signup — there is no add-recipient route yet, matching the shipped Settings UI, which only edits existing rows.
   * @summary List escalation notification recipients
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  notificationRecipientsControllerListV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<NotificationRecipientListResponseDto>;

  /**
   * Changes `channel` and/or `isActive` for one recipient. Both fields optional, but at least one is required — matches the Settings UI’s channel toggle and active switch, which fire independently. `userId` is never editable here: repointing a recipient row at a different user is a remove-and-re-add, not an update.
   * @summary Update a notification recipient
   * @param {SettingsApiNotificationRecipientsControllerUpdateV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  notificationRecipientsControllerUpdateV1(
    requestParameters: SettingsApiNotificationRecipientsControllerUpdateV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<NotificationRecipientDto>;

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
   * Creates the invited member\'s own row (`status: \"invited\"`, no password, `role: \"member\"`) and a 7-day invite token, then emails the invite link. Refused with 403 while `platform_settings.invite_members_enabled` is off.
   * @summary Invite a teammate
   * @param {SettingsApiTenantMembersControllerInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  tenantMembersControllerInviteV1(
    requestParameters: SettingsApiTenantMembersControllerInviteV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TenantMemberResponseDto>;

  /**
   * Every `users` row for the caller\'s own tenant — the owner (created at signup, never invited) and every member, invited or active. Oldest-first, so the owner leads the list.
   * @summary List this tenant\'s team, owner included
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  tenantMembersControllerListV1(
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<Array<TenantMemberResponseDto>>;

  /**
   * Deletes the invited member\'s row outright — only while it is still `invited`. A member who has already accepted cannot be removed through this route.
   * @summary Revoke a pending invite
   * @param {SettingsApiTenantMembersControllerRevokeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  tenantMembersControllerRevokeV1(
    requestParameters: SettingsApiTenantMembersControllerRevokeV1Request,
    options?: RawAxiosRequestConfig,
  ): AxiosPromise<TenantMembersControllerRevokeV1200Response>;

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
 * Request parameters for notificationRecipientsControllerUpdateV1 operation in SettingsApi.
 */
export interface SettingsApiNotificationRecipientsControllerUpdateV1Request {
  readonly recipientId: string;

  readonly updateNotificationRecipientDto: UpdateNotificationRecipientDto;
}

/**
 * Request parameters for tenantMembersControllerInviteV1 operation in SettingsApi.
 */
export interface SettingsApiTenantMembersControllerInviteV1Request {
  readonly inviteMemberDto: InviteMemberDto;
}

/**
 * Request parameters for tenantMembersControllerRevokeV1 operation in SettingsApi.
 */
export interface SettingsApiTenantMembersControllerRevokeV1Request {
  /**
   * The invited member\&#39;s &#x60;users.id&#x60;
   */
  readonly memberId: string;
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
   * Owner-only. Every `notification_recipients` row for this tenant, joined to `users` for name/initials. Seeded with exactly one row (the signing-up owner) at signup — there is no add-recipient route yet, matching the shipped Settings UI, which only edits existing rows.
   * @summary List escalation notification recipients
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public notificationRecipientsControllerListV1(
    options?: RawAxiosRequestConfig,
  ) {
    return SettingsApiFp(this.configuration)
      .notificationRecipientsControllerListV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Changes `channel` and/or `isActive` for one recipient. Both fields optional, but at least one is required — matches the Settings UI’s channel toggle and active switch, which fire independently. `userId` is never editable here: repointing a recipient row at a different user is a remove-and-re-add, not an update.
   * @summary Update a notification recipient
   * @param {SettingsApiNotificationRecipientsControllerUpdateV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public notificationRecipientsControllerUpdateV1(
    requestParameters: SettingsApiNotificationRecipientsControllerUpdateV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return SettingsApiFp(this.configuration)
      .notificationRecipientsControllerUpdateV1(
        requestParameters.recipientId,
        requestParameters.updateNotificationRecipientDto,
        options,
      )
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
   * Creates the invited member\'s own row (`status: \"invited\"`, no password, `role: \"member\"`) and a 7-day invite token, then emails the invite link. Refused with 403 while `platform_settings.invite_members_enabled` is off.
   * @summary Invite a teammate
   * @param {SettingsApiTenantMembersControllerInviteV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public tenantMembersControllerInviteV1(
    requestParameters: SettingsApiTenantMembersControllerInviteV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return SettingsApiFp(this.configuration)
      .tenantMembersControllerInviteV1(
        requestParameters.inviteMemberDto,
        options,
      )
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Every `users` row for the caller\'s own tenant — the owner (created at signup, never invited) and every member, invited or active. Oldest-first, so the owner leads the list.
   * @summary List this tenant\'s team, owner included
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public tenantMembersControllerListV1(options?: RawAxiosRequestConfig) {
    return SettingsApiFp(this.configuration)
      .tenantMembersControllerListV1(options)
      .then((request) => request(this.axios, this.basePath));
  }

  /**
   * Deletes the invited member\'s row outright — only while it is still `invited`. A member who has already accepted cannot be removed through this route.
   * @summary Revoke a pending invite
   * @param {SettingsApiTenantMembersControllerRevokeV1Request} requestParameters Request parameters.
   * @param {*} [options] Override http request option.
   * @throws {RequiredError}
   */
  public tenantMembersControllerRevokeV1(
    requestParameters: SettingsApiTenantMembersControllerRevokeV1Request,
    options?: RawAxiosRequestConfig,
  ) {
    return SettingsApiFp(this.configuration)
      .tenantMembersControllerRevokeV1(requestParameters.memberId, options)
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
