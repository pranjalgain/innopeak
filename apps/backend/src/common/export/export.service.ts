import { Injectable, Logger } from '@nestjs/common';

import {
  CsvExportOptions,
  ExcelExportOptions,
  ExportData,
  PdfExportOptions,
} from './interfaces/export.interface';
import { CsvProvider } from './providers/csv.provider';
import { ExcelProvider } from './providers/excel.provider';
import { PdfProvider } from './providers/pdf.provider';

/**
 * Facade service for data export operations.
 *
 * Delegates to specialized providers for CSV, PDF, and Excel generation.
 * Each method returns a Buffer that can be streamed directly to the client
 * via a StreamableFile or piped to a response object.
 *
 * Usage in a controller:
 * ```ts
 * @Get('export/csv')
 * async exportCsv(@Res() res: Response) {
 *   const data = await this.myService.findAll();
 *   const buffer = await this.exportService.exportToCsv(data);
 *   res.set({
 *     'Content-Type': 'text/csv',
 *     'Content-Disposition': 'attachment; filename="export.csv"',
 *   });
 *   res.send(buffer);
 * }
 * ```
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly csvProvider: CsvProvider,
    private readonly pdfProvider: PdfProvider,
    private readonly excelProvider: ExcelProvider
  ) {}

  /**
   * Export an array of objects to CSV format.
   *
   * @param data - Array of record objects to export
   * @param options - CSV formatting options (columns, headers, delimiter, etc.)
   * @returns Buffer containing the CSV content (UTF-8 with BOM)
   */
  exportToCsv(data: Record<string, unknown>[], options?: CsvExportOptions): Promise<Buffer> {
    this.logger.log(`Exporting ${data.length} records to CSV`);
    return Promise.resolve(this.csvProvider.generate(data, options));
  }

  /**
   * Export structured data to a PDF report.
   *
   * @param data - Export data containing rows, optional columns, and header mappings
   * @param options - PDF formatting options (title, subtitle, orientation, page size)
   * @returns Buffer containing the PDF document
   */
  async exportToPdf(data: ExportData, options?: PdfExportOptions): Promise<Buffer> {
    this.logger.log(`Exporting ${data.rows.length} records to PDF`);
    return this.pdfProvider.generate(data, options);
  }

  /**
   * Export an array of objects to an Excel (.xlsx) workbook.
   *
   * @param data - Array of record objects to export
   * @param options - Excel formatting options (sheet name, columns, headers)
   * @returns Buffer containing the Excel workbook
   */
  async exportToExcel(
    data: Record<string, unknown>[],
    options?: ExcelExportOptions
  ): Promise<Buffer> {
    this.logger.log(`Exporting ${data.length} records to Excel`);
    return this.excelProvider.generate(data, options);
  }
}
