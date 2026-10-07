import { buildReceiptFilename, renderReceiptPdf } from './receipt-pdf.util';

describe('renderReceiptPdf', () => {
  it('produces a real PDF buffer', async () => {
    const buffer = await renderReceiptPdf({
      businessName: 'Acme Inc',
      billedToEmail: 'owner@acme.test',
      invoiceNumber: 'INV-0001',
      stripeInvoiceId: 'in_1AbCdEfGhIjKlMnO',
      paidAt: '2026-09-01T00:00:00.000Z',
      amountPaid: 4900,
      currency: 'usd',
      planDescription: 'InnoPeak Paid Plan — Monthly Subscription',
    });

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(0);
  });

  /** Guards the layout: a long `tenants.name` or Stripe id wraps, so the layout must flow from measured heights (fixed offsets overdrew the email and struck the reference with the divider). */
  it('renders wrapping business names and long Stripe ids without throwing', async () => {
    const buffer = await renderReceiptPdf({
      businessName: 'Coastal Table Hospitality Group International Holdings Limited Partnership',
      billedToEmail: 'accounts.payable.department@coastaltablehospitalitygroup.example.com',
      invoiceNumber: 'INV-0001',
      stripeInvoiceId: 'in_1QmXyZAbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
      paidAt: '2026-09-01T00:00:00.000Z',
      amountPaid: 129999999,
      currency: 'usd',
      planDescription: 'InnoPeak Paid Plan — Monthly Subscription',
    });

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('still produces a valid PDF when the invoice number is unassigned', async () => {
    const buffer = await renderReceiptPdf({
      businessName: 'Acme Inc',
      billedToEmail: 'owner@acme.test',
      invoiceNumber: null,
      stripeInvoiceId: 'in_1AbCdEfGhIjKlMnO',
      paidAt: '2026-09-01T00:00:00.000Z',
      amountPaid: 4900,
      currency: 'usd',
      planDescription: 'InnoPeak Paid Plan — Monthly Subscription',
    });

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(0);
  });
});

describe('buildReceiptFilename', () => {
  it('uses the invoice number, stripped to filename-safe characters', () => {
    const filename = buildReceiptFilename({
      invoiceNumber: '8E8B7F1/0001',
      paidAt: '2026-09-01T00:00:00.000Z',
    });

    expect(filename).toBe('InnoPeak-Receipt-8E8B7F10001.pdf');
  });

  it('falls back to the paid date when there is no invoice number', () => {
    const filename = buildReceiptFilename({
      invoiceNumber: null,
      paidAt: '2026-09-01T00:00:00.000Z',
    });

    expect(filename).toBe('InnoPeak-Receipt-2026-09-01.pdf');
  });
});
