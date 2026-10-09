import PDFDocument from 'pdfkit';

export interface ReceiptPdfInput {
  businessName: string;
  billedToEmail: string;
  invoiceNumber: string | null;
  stripeInvoiceId: string;
  paidAt: string;
  amountPaid: number;
  currency: string;
  /** A plain description: `billing_plans` has one paid product, so there is no line-item catalog to look up. */
  planDescription: string;
}

const PAGE_MARGIN = 50;
const HEADER_HEIGHT = 92;
const CONTENT_RIGHT_COL_WIDTH = 190;

const COLOR = {
  headerBg: '#111827',
  accent: '#ec4899',
  paid: '#059669',
  heading: '#111827',
  body: '#374151',
  muted: '#6b7280',
  rule: '#e5e7eb',
} as const;

/** `amountPaid` is in the smallest currency unit; dividing by 100 assumes a 2-decimal currency (JPY would need its own branch). */
function formatAmount(amountPaid: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountPaid / 100);
}

function formatPaidDate(paidAt: string): string {
  return new Date(paidAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Returns the y below the drawn value, measured with heightOfString since values are unbounded and can wrap; callers must flow from it, not fixed offsets. */
function drawLabeledValue(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  align: 'left' | 'right',
  valueFontSize = 11
): number {
  doc
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .fillColor(COLOR.muted)
    .text(label.toUpperCase(), x, y, { width, align, characterSpacing: 0.6 });

  const valueY = y + 12;
  doc
    .font(valueFontSize > 9 ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(valueFontSize)
    .fillColor(COLOR.heading)
    .text(value, x, valueY, { width, align });

  return valueY + doc.heightOfString(value, { width });
}

function drawRule(doc: PDFKit.PDFDocument, y: number, width: number): void {
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + width, y)
    .lineWidth(1)
    .strokeColor(COLOR.rule)
    .stroke();
}

/**
 * Renders a one-page PDF receipt in-process with pdfkit. Receipts come from Stripe payments.
 * Deliberately shows no tax line (none is computed) and no card (the card on file can change after payment,
 * and `billing_receipts` keeps no point-in-time snapshot of it).
 */
export function renderReceiptPdf(input: ReceiptPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks: Buffer[] = [];
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - PAGE_MARGIN * 2;

    doc.on('data', chunk => chunks.push(chunk as Buffer));
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);

    doc.rect(0, 0, pageWidth, HEADER_HEIGHT).fill(COLOR.headerBg);
    doc.rect(0, HEADER_HEIGHT - 3, pageWidth, 3).fill(COLOR.accent);

    doc.font('Helvetica-Bold').fontSize(19).fillColor('#ffffff').text('InnoPeak', PAGE_MARGIN, 26);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#cbd5e1')
      .text('Google Business Profile review management', PAGE_MARGIN, 50);

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(COLOR.accent)
      .text('RECEIPT', 0, 26, {
        width: pageWidth - PAGE_MARGIN,
        align: 'right',
        characterSpacing: 1.5,
      });

    const badgeWidth = 46;
    const badgeX = pageWidth - PAGE_MARGIN - badgeWidth;
    doc.roundedRect(badgeX, 48, badgeWidth, 16, 8).fill(COLOR.paid);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#ffffff')
      .text('PAID', badgeX, 52, { width: badgeWidth, align: 'center', characterSpacing: 1 });

    let y = HEADER_HEIGHT + 32;
    const leftColWidth = contentWidth - CONTENT_RIGHT_COL_WIDTH - 20;
    const rightColX = PAGE_MARGIN + contentWidth - CONTENT_RIGHT_COL_WIDTH;

    // `businessName` (varchar 255) and the Stripe id are unbounded, so either column can wrap; the divider must clear the taller one.
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(COLOR.muted)
      .text('BILLED TO', PAGE_MARGIN, y, { characterSpacing: 0.6 });

    const businessNameY = y + 13;
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(COLOR.heading)
      .text(input.businessName, PAGE_MARGIN, businessNameY, { width: leftColWidth });
    const emailY =
      businessNameY + doc.heightOfString(input.businessName, { width: leftColWidth }) + 4;
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLOR.muted)
      .text(input.billedToEmail, PAGE_MARGIN, emailY, { width: leftColWidth });
    const leftColBottom = emailY + doc.heightOfString(input.billedToEmail, { width: leftColWidth });

    const ROW_GAP = 10;
    let rightColBottom = drawLabeledValue(
      doc,
      'Invoice number',
      input.invoiceNumber ?? '—',
      rightColX,
      y,
      CONTENT_RIGHT_COL_WIDTH,
      'right'
    );
    rightColBottom = drawLabeledValue(
      doc,
      'Date paid',
      formatPaidDate(input.paidAt),
      rightColX,
      rightColBottom + ROW_GAP,
      CONTENT_RIGHT_COL_WIDTH,
      'right'
    );
    rightColBottom = drawLabeledValue(
      doc,
      'Reference',
      input.stripeInvoiceId,
      rightColX,
      rightColBottom + ROW_GAP,
      CONTENT_RIGHT_COL_WIDTH,
      'right',
      8.5
    );

    y = Math.max(leftColBottom, rightColBottom) + 22;
    drawRule(doc, y, contentWidth);

    y += 22;
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(COLOR.muted)
      .text('DESCRIPTION', PAGE_MARGIN, y, { characterSpacing: 0.6 })
      .text('AMOUNT', PAGE_MARGIN, y, {
        width: contentWidth,
        align: 'right',
        characterSpacing: 0.6,
      });

    y += 18;
    drawRule(doc, y, contentWidth);

    y += 16;
    // Capped at 65% of the content width so a long description can't run under the right-aligned amount.
    const descriptionWidth = contentWidth * 0.65;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(COLOR.body)
      .text(input.planDescription, PAGE_MARGIN, y, { width: descriptionWidth });
    const descriptionBottom =
      y + doc.heightOfString(input.planDescription, { width: descriptionWidth });
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(COLOR.body)
      .text(formatAmount(input.amountPaid, input.currency), PAGE_MARGIN, y, {
        width: contentWidth,
        align: 'right',
      });

    y = descriptionBottom + 2;
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLOR.muted)
      .text('Recurring monthly subscription', PAGE_MARGIN, y, { width: descriptionWidth });

    y += doc.heightOfString('Recurring monthly subscription', { width: descriptionWidth }) + 14;
    drawRule(doc, y, contentWidth);

    y += 18;
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLOR.muted)
      .text('TOTAL PAID', PAGE_MARGIN, y, {
        width: contentWidth,
        align: 'right',
        characterSpacing: 0.6,
      });
    y += 14;
    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor(COLOR.heading)
      .text(formatAmount(input.amountPaid, input.currency), PAGE_MARGIN, y, {
        width: contentWidth,
        align: 'right',
      });

    const footerY = doc.page.height - 90;
    drawRule(doc, footerY, contentWidth);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(COLOR.body)
      .text('Thank you for choosing InnoPeak.', PAGE_MARGIN, footerY + 20, {
        width: contentWidth,
        align: 'center',
      });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(
        'This receipt was generated automatically for your records. For billing questions, ' +
          'contact your account owner.',
        PAGE_MARGIN,
        footerY + 38,
        { width: contentWidth, align: 'center' }
      );

    doc.end();
  });
}

/** Prefers the Stripe invoice number (filename-safe), falling back to the paid date when none is assigned yet. */
export function buildReceiptFilename(
  input: Pick<ReceiptPdfInput, 'invoiceNumber' | 'paidAt'>
): string {
  const identifier = input.invoiceNumber
    ? input.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')
    : new Date(input.paidAt).toISOString().slice(0, 10);
  return `InnoPeak-Receipt-${identifier}.pdf`;
}
