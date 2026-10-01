// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface UpdateBusinessStatusDto {
  status: UpdateBusinessStatusDtoStatusEnum;
}

export const UpdateBusinessStatusDtoStatusEnum = {
  Active: 'active',
  Suspended: 'suspended',
  Erased: 'erased',
} as const;

export type UpdateBusinessStatusDtoStatusEnum =
  (typeof UpdateBusinessStatusDtoStatusEnum)[keyof typeof UpdateBusinessStatusDtoStatusEnum];
