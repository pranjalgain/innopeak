// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ReceiptDto {
  id: string;
  /**
   * Smallest currency unit (e.g. cents)
   */
  amountPaid: number;
  /**
   * Lowercase ISO 4217 code
   */
  currency: string;
  invoiceNumber: string | null;
  paidAt: string;
}
