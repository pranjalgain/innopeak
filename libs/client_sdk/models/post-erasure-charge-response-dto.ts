// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface PostErasureChargeResponseDto {
  /**
   * Pass to `resolve`.
   */
  receiptId: string;
  tenantId: string;
  businessName: string;
  invoiceNumber: string | null;
  /**
   * Smallest currency unit (cents), as Stripe charged it.
   */
  amountPaid: number;
  /**
   * Lowercase ISO 4217 code.
   */
  currency: string;
  paidAt: string;
}
