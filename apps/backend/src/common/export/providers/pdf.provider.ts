import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';

import { ExportData, PdfExportOptions } from '../interfaces/export.interface';

/** Spacing and layout constants */
const MARGIN = 50;
const HEADER_FONT_SIZE = 20;
const SUBTITLE_FONT_SIZE = 14;
const TABLE_FONT_SIZE = 10;
const TABLE_HEADER_FONT_SIZE = 10;
const ROW_HEIGHT = 20;
const HEADER_ROW_HEIGHT = 25;
const CELL_PADDING = 5;
const FOOTER_FONT_SIZE = 8;

/** PDF page size dimensions (width x height in points) */
const PAGE_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
};

@Injectable()
export class PdfProvider {
  private readonly logger = new Logger(PdfProvider.name);

  /**
   * Generate a PDF document from structured export data.
   *
   * Renders a title, optional subtitle, a data table, and page-numbered footers.
   * Supports portrait and landscape orientations, A4 and Letter page sizes.
   */
  generate(data: ExportData, options: PdfExportOptions = {}): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      try {
        const rows = data.rows;

        if (rows.length === 0) {
          this.logger.warn('PDF export called with empty data array');
        }

        const columns = options.columns ?? data.columns ?? this.extractColumns(rows);
        const headerMap = options.headers ?? data.headers ?? {};
        const pageSize = options.pageSize ?? 'A4';
        const orientation = options.orientation ?? 'portrait';

        const dimensions = PAGE_SIZES[pageSize] ?? PAGE_SIZES['A4'];
        if (!dimensions) {
          reject(new Error(`Unsupported page size: ${pageSize}`));
          return;
        }

        const isLandscape = orientation === 'landscape';
        const pageWidth = isLandscape ? dimensions.height : dimensions.width;
        const pageHeight = isLandscape ? dimensions.width : dimensions.height;

        const doc = new PDFDocument({
          size: pageSize,
          layout: orientation,
          margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          bufferPages: true,
          info: {
            Title: options.title ?? 'Export',
            Creator: 'NestJS Export Service',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => {
          const result = Buffer.concat(chunks);
          this.logger.log(
            `PDF generated: ${rows.length} rows, ${columns.length} columns, ${result.length} bytes`
          );
          resolve(result);
        });
        doc.on('error', (err: Error) => {
          reject(err);
        });

        const usableWidth = pageWidth - MARGIN * 2;

        // ── Title ──────────────────────────────────────────────────────
        if (options.title) {
          doc
            .fontSize(HEADER_FONT_SIZE)
            .font('Helvetica-Bold')
            .text(options.title, MARGIN, MARGIN, {
              align: 'center',
              width: usableWidth,
            });
          doc.moveDown(0.5);
        }

        // ── Subtitle ──────────────────────────────────────────────────
        if (options.subtitle) {
          doc
            .fontSize(SUBTITLE_FONT_SIZE)
            .font('Helvetica')
            .fillColor('#666666')
            .text(options.subtitle, MARGIN, doc.y, {
              align: 'center',
              width: usableWidth,
            });
          doc.fillColor('#000000');
          doc.moveDown(1);
        }

        // ── Table ─────────────────────────────────────────────────────
        if (columns.length > 0 && rows.length > 0) {
          const columnWidth = usableWidth / columns.length;
          let currentY = doc.y;

          // Table header
          this.drawTableRow(
            doc,
            columns.map(col => headerMap[col] ?? col),
            MARGIN,
            currentY,
            columnWidth,
            HEADER_ROW_HEIGHT,
            true
          );
          currentY += HEADER_ROW_HEIGHT;

          // Table data rows
          for (const row of rows) {
            // Check if we need a new page (leave room for footer)
            if (currentY + ROW_HEIGHT > pageHeight - MARGIN - 20) {
              doc.addPage();
              currentY = MARGIN;

              // Re-draw header on new page
              this.drawTableRow(
                doc,
                columns.map(col => headerMap[col] ?? col),
                MARGIN,
                currentY,
                columnWidth,
                HEADER_ROW_HEIGHT,
                true
              );
              currentY += HEADER_ROW_HEIGHT;
            }

            const values = columns.map(col => this.formatCellValue(row[col]));
            this.drawTableRow(doc, values, MARGIN, currentY, columnWidth, ROW_HEIGHT, false);
            currentY += ROW_HEIGHT;
          }
        }

        // ── Footer with page numbers ──────────────────────────────────
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc
            .fontSize(FOOTER_FONT_SIZE)
            .font('Helvetica')
            .fillColor('#999999')
            .text(`Page ${i + 1} of ${pageCount}`, MARGIN, pageHeight - MARGIN + 10, {
              align: 'center',
              width: usableWidth,
            });
        }

        doc.end();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown PDF generation error';
        this.logger.error(`PDF generation failed: ${message}`);
        reject(error instanceof Error ? error : new Error(message));
      }
    });
  }

  /**
   * Draw a single table row (header or data).
   */
  private drawTableRow(
    doc: PDFKit.PDFDocument,
    values: string[],
    startX: number,
    y: number,
    columnWidth: number,
    rowHeight: number,
    isHeader: boolean
  ): void {
    // Background for header rows
    if (isHeader) {
      doc.rect(startX, y, columnWidth * values.length, rowHeight).fill('#f0f0f0');
      doc.fillColor('#000000');
    }

    // Draw cell borders and text
    for (let i = 0; i < values.length; i++) {
      const cellX = startX + i * columnWidth;
      const cellValue = values[i] ?? '';

      // Cell border
      doc.rect(cellX, y, columnWidth, rowHeight).stroke('#cccccc');

      // Cell text
      doc
        .fontSize(isHeader ? TABLE_HEADER_FONT_SIZE : TABLE_FONT_SIZE)
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor('#000000')
        .text(cellValue, cellX + CELL_PADDING, y + CELL_PADDING, {
          width: columnWidth - CELL_PADDING * 2,
          height: rowHeight - CELL_PADDING * 2,
          ellipsis: true,
          lineBreak: false,
        });
    }
  }

  /**
   * Extract column names from the first row of data.
   */
  private extractColumns(rows: Record<string, unknown>[]): string[] {
    const firstRow = rows[0];
    if (!firstRow) {
      return [];
    }
    return Object.keys(firstRow);
  }

  /**
   * Format a cell value for PDF display.
   */
  private formatCellValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return value.toString();
    }

    // Objects, arrays, functions, symbols, etc. — fall back to a JSON representation
    // rather than risking Object.prototype's default `[object Object]` stringification.
    return JSON.stringify(value);
  }
}
