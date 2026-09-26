import type { BillingReceiptRow } from '@db/repositories/billing/billing-receipts.repository';
import { ApiProperty } from '@nestjs/swagger';

export class ReceiptDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0099' })
  id!: string;

  @ApiProperty({ example: 4900, description: 'Smallest currency unit (e.g. cents)' })
  amountPaid!: number;

  @ApiProperty({ example: 'usd', description: 'Lowercase ISO 4217 code' })
  currency!: string;

  @ApiProperty({ example: '8E8B7F1-0001', nullable: true, type: String })
  invoiceNumber!: string | null;

  @ApiProperty({ example: '2026-09-01T12:00:00.000Z' })
  paidAt!: string;

  static from(row: BillingReceiptRow): ReceiptDto {
    const dto = new ReceiptDto();
    dto.id = row.id;
    dto.amountPaid = row.amountPaid;
    dto.currency = row.currency;
    dto.invoiceNumber = row.invoiceNumber;
    dto.paidAt = row.paidAt;
    return dto;
  }
}

export class ReceiptListResponseDto {
  @ApiProperty({ type: [ReceiptDto] })
  receipts!: ReceiptDto[];

  static from(rows: BillingReceiptRow[]): ReceiptListResponseDto {
    const dto = new ReceiptListResponseDto();
    dto.receipts = rows.map(row => ReceiptDto.from(row));
    return dto;
  }
}
