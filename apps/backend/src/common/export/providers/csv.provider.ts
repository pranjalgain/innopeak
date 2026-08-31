import { Injectable, Logger } from '@nestjs/common';

import { CsvExportOptions } from '../interfaces/export.interface';

/** Default CSV field delimiter. */
const DEFAULT_DELIMITER = ',';

@Injectable()
export class CsvProvider {
  private readonly logger = new Logger(CsvProvider.name);

  /**
   * Convert an array of record objects into a CSV buffer.
   *
   * Handles proper escaping of values containing delimiters, quotes, and newlines.
   * Column order is determined by the `columns` option or the keys of the first row.
   */
  generate(data: Record<string, unknown>[], options: CsvExportOptions = {}): Buffer {
    const delimiter = options.delimiter ?? DEFAULT_DELIMITER;
    const includeHeaders = options.includeHeaders ?? true;

    if (data.length === 0) {
      this.logger.warn('CSV export called with empty data array');
      return Buffer.from('', 'utf-8');
    }

    const firstRow = data[0];
    if (!firstRow) {
      return Buffer.from('', 'utf-8');
    }

    const columns = options.columns ?? Object.keys(firstRow);
    const headerMap = options.headers ?? {};

    const lines: string[] = [];

    // Header row
    if (includeHeaders) {
      const headerLine = columns
        .map(col => this.escapeField(headerMap[col] ?? col, delimiter))
        .join(delimiter);
      lines.push(headerLine);
    }

    // Data rows
    for (const row of data) {
      const line = columns
        .map(col => {
          const value = row[col];
          return this.escapeField(this.formatValue(value), delimiter);
        })
        .join(delimiter);
      lines.push(line);
    }

    const csvContent = lines.join('\r\n');
    const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility

    this.logger.log(`CSV generated: ${data.length} rows, ${columns.length} columns`);

    return Buffer.from(bom + csvContent, 'utf-8');
  }

  /**
   * Escape a single CSV field value.
   *
   * Fields containing the delimiter, double quotes, or newlines are wrapped
   * in double quotes. Any existing double quotes within the value are doubled.
   */
  private escapeField(value: string, delimiter: string): string {
    if (
      value.includes(delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      const escaped = value.replace(/"/g, '""');
      return `"${escaped}"`;
    }

    return value;
  }

  /**
   * Convert an unknown value to its string representation for CSV output.
   */
  private formatValue(value: unknown): string {
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
