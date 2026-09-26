import PDFDocument from 'pdfkit';

export interface ReceiptPdfInput {
  businessName: string;
  /** The tenant owner's own email — shown under the business name in "Billed to", the same way a
   *  real invoice's recipient block carries both a company name and a contact. */
  billedToEmail: string;
  invoiceNumber: string | null;
  /** Stripe's own invoice id (`in_...`) — a secondary reference alongside the human-readable
   *  `invoiceNumber`, the same way a Stripe-hosted invoice PDF exposes both. */
  stripeInvoiceId: string;
  paidAt: string;
  amountPaid: number;
  currency: string;
  /** What this payment was for. A plain description rather than a looked-up line-item catalog:
   *  `billing_plans` has exactly one paid product today (see `BillingPlanCode`), so there is
   *  nothing to look up yet — the caller passes the one line this describes. */
  planDescription: string;
}

const PAGE_MARGIN = 50;
const HEADER_HEIGHT = 92;
const CONTENT_RIGHT_COL_WIDTH = 190;

// A small, deliberately restrained palette — a receipt is a document people print or attach to an
// expense report, so the body stays white/near-black for ink and legibility; color is spent only
// on the header band, the PAID stamp, and the total, not the whole page.
const COLOR = {
  headerBg: '#111827', // slate-900 — matches the app shell's own dark surface
  accent: '#ec4899', // pink-500 — the brand's own accent (the dot in "inno•peak")
  paid: '#059669', // emerald-600 — a status color, deliberately not the brand accent
  heading: '#111827',
  body: '#374151',
  muted: '#6b7280',
  rule: '#e5e7eb',
} as const;

/** `amountPaid` is Stripe's own smallest-currency-unit integer (e.g. cents) — `Intl.NumberFormat`
 *  expects the major unit, so this divides by 100. Correct for every currency Stripe issues test
 *  prices in today (all 2-decimal); a zero-decimal currency (e.g. JPY) would need its own branch,
 *  not worth adding speculatively ahead of a real need. */
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

/**
 * A small "LABEL" over a value, the recurring unit this layout repeats for every field — keeping
 * the label/value pairing consistent is what makes the details block read as one designed unit
 * rather than a stack of unrelated lines. `valueFontSize` is overridable for a long, naturally
 * small-print value (Stripe's own invoice id) that would otherwise look like it's shouting.
 *
 * Returns the y coordinate directly below the value it drew, measured with `heightOfString`
 * rather than assumed: every value here is caller-supplied and unbounded (a 255-char business
 * name, a long Stripe id), so any of them can wrap to a second line. Callers must flow from this
 * return value instead of a fixed offset — the previous fixed offsets drew the next element on top
 * of a wrapped one.
 */
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

  // Measured after `.text()` so it reflects the font/size just used for the value itself.
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
 * Renders a single-page, invoice-style PDF payment receipt entirely in-process (no headless
 * browser, no external template engine) — `pdfkit` draws directly onto a stream we buffer into
 * memory, since every receipt is one page of absolutely-positioned text/shapes and never large
 * enough to warrant streaming to the HTTP response incrementally. Stripe-only, by design: see
 * `0012_billing_receipts.sql`'s own comment for why no `DummyPaymentProvider` payment ever reaches
 * this.
 *
 * Deliberately doesn't show a tax line or the card used: this app doesn't collect/compute tax
 * today, so a "$0.00 tax" line would assert something not actually true rather than merely omit
 * it; and the card on file can change after a payment posts, so showing "today's" card next to an
 * old payment would misrepresent what was actually charged at the time — `billing_receipts` has no
 * point-in-time snapshot of it to show instead.
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

    // ── Header band ──────────────────────────────────────────────────────
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

    // A small "stamp" against the dark header — the fastest possible answer to "did this get
    // paid?" for anyone skimming an inbox full of PDFs, before reading a single line of detail.
    const badgeWidth = 46;
    const badgeX = pageWidth - PAGE_MARGIN - badgeWidth;
    doc.roundedRect(badgeX, 48, badgeWidth, 16, 8).fill(COLOR.paid);
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor('#ffffff')
      .text('PAID', badgeX, 52, { width: badgeWidth, align: 'center', characterSpacing: 1 });

    // ── Billed to / invoice details ──────────────────────────────────────
    let y = HEADER_HEIGHT + 32;
    const leftColWidth = contentWidth - CONTENT_RIGHT_COL_WIDTH - 20;
    const rightColX = PAGE_MARGIN + contentWidth - CONTENT_RIGHT_COL_WIDTH;

    // Both columns flow from measured text heights rather than fixed offsets — `businessName` is
    // a varchar(255) and the Stripe id is unbounded, so either column can run to two lines, and
    // the divider below has to clear whichever ended up taller.
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

    // ── Divider ──────────────────────────────────────────────────────────
    y = Math.max(leftColBottom, rightColBottom) + 22;
    drawRule(doc, y, contentWidth);

    // ── Line item ────────────────────────────────────────────────────────
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
    // Capped at 65% of the content width so a long description can never run under the
    // right-aligned amount; measured afterwards so the sub-note clears it if it does wrap.
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

    // ── Total ────────────────────────────────────────────────────────────
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

    // ── Footer ───────────────────────────────────────────────────────────
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

/** `InnoPeak-Receipt-<identifier>.pdf` — a human-readable download name instead of the receipt's
 *  raw UUID. Prefers Stripe's own invoice number (stripped to filename-safe characters); falls
 *  back to the paid date for the rare invoice with no number assigned yet. */
export function buildReceiptFilename(
  input: Pick<ReceiptPdfInput, 'invoiceNumber' | 'paidAt'>
): string {
  const identifier = input.invoiceNumber
    ? input.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '')
    : new Date(input.paidAt).toISOString().slice(0, 10);
  return `InnoPeak-Receipt-${identifier}.pdf`;
}
