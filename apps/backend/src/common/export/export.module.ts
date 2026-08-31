import { Module } from '@nestjs/common';

import { ExportService } from './export.service';
import { CsvProvider } from './providers/csv.provider';
import { ExcelProvider } from './providers/excel.provider';
import { PdfProvider } from './providers/pdf.provider';

/**
 * ExportModule provides CSV, PDF, and Excel export capabilities.
 *
 * Import this module into any domain module that needs data export:
 * ```ts
 * @Module({
 *   imports: [ExportModule],
 * })
 * export class ReportsModule {}
 * ```
 *
 * Then inject ExportService into your controllers or services:
 * ```ts
 * constructor(private readonly exportService: ExportService) {}
 * ```
 */
@Module({
  providers: [ExportService, CsvProvider, PdfProvider, ExcelProvider],
  exports: [ExportService],
})
export class ExportModule {}
