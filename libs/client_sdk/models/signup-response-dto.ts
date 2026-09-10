// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface SignupResponseDto {
  tenantId: string;
  userId: string;
  status: SignupResponseDtoStatusEnum;
  message: string;
}

export const SignupResponseDtoStatusEnum = {
  PendingVerification: 'pending_verification',
} as const;

export type SignupResponseDtoStatusEnum =
  (typeof SignupResponseDtoStatusEnum)[keyof typeof SignupResponseDtoStatusEnum];
