import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

import { ExcelExportOptions } from '../interfaces/export.interface';

/** Minimum column width in characters. */
const MIN_COLUMN_WIDTH = 10;

/** Maximum column width in characters. */
const MAX_COLUMN_WIDTH = 50;

/** Extra padding (characters) added to auto-width calculations. */
const WIDTH_PADDING = 2;

@Injectable()
export class ExcelProvider {
  private readonly logger = new Logger(ExcelProvider.name);

  /**
   * Generate an Excel (.xlsx) workbook from an array of record objects.
   *
   * Features:
   * - Custom sheet name
   * - Column selection and header mapping
   * - Auto-width columns based on content
   * - Styled header row (bold, grey background)
   */
  async generate(
    data: Record<string, unknown>[],
    options: ExcelExportOptions = {}
  ): Promise<Buffer> {
    const sheetName = options.sheetName ?? 'Sheet1';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NestJS Export Service';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(sheetName);

    if (data.length === 0) {
      this.logger.warn('Excel export called with empty data array');
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    }

    const firstRow = data[0];
    if (!firstRow) {
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    }

    const columns = options.columns ?? Object.keys(firstRow);
    const headerMap = options.headers ?? {};

    // Define worksheet columns with headers
    worksheet.columns = columns.map(col => ({
      header: headerMap[col] ?? col,
      key: col,
      width: MIN_COLUMN_WIDTH,
    }));

    // Add data rows
    for (const row of data) {
      const rowValues: Record<string, unknown> = {};
      for (const col of columns) {
        rowValues[col] = this.formatValue(row[col]);
      }
      worksheet.addRow(rowValues);
    }

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 25;
    headerRow.commit();

    // Auto-width columns based on content
    this.autoFitColumns(worksheet, columns, headerMap);

    // Add filters to the header row
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    const buffer = await workbook.xlsx.writeBuffer();

    this.logger.log(
      `Excel generated: ${data.length} rows, ${columns.length} columns, sheet="${sheetName}"`
    );

    return Buffer.from(buffer);
  }

  /**
   * Auto-fit column widths based on the longest content in each column.
   */
  private autoFitColumns(
    worksheet: ExcelJS.Worksheet,
    columns: string[],
    headerMap: Record<string, string>
  ): void {
    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
      const colKey = columns[colIndex];
      if (!colKey) {
        continue;
      }

      const headerLength = (headerMap[colKey] ?? colKey).length;
      let maxLength = headerLength;

      const column = worksheet.getColumn(colIndex + 1);
      column.eachCell({ includeEmpty: false }, cell => {
        const cellLength = this.getCellDisplayLength(cell.value);
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });

      column.width = Math.max(
        MIN_COLUMN_WIDTH,
        Math.min(maxLength + WIDTH_PADDING, MAX_COLUMN_WIDTH)
      );
    }
  }

  /**
   * Convert an unknown value to a type suitable for Excel cells.
   */
  private formatValue(value: unknown): Date | boolean | number | string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    // Objects, arrays, functions, symbols, etc. — fall back to a JSON representation
    // rather than risking Object.prototype's default `[object Object]` stringification.
    return JSON.stringify(value);
  }

  /**
   * Compute the display length of a worksheet cell's value for auto-width sizing.
   * ExcelJS cell values can be rich objects (hyperlinks, formulas, rich text) that
   * don't have a meaningful `toString()`, so those are measured via their JSON form.
   */
  private getCellDisplayLength(value: ExcelJS.CellValue): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'object') {
      return JSON.stringify(value).length;
    }

    return String(value).length;
  }
}
