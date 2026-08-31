import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ExportService } from './export.service';
import { CsvProvider } from './providers/csv.provider';
import { ExcelProvider } from './providers/excel.provider';
import { PdfProvider } from './providers/pdf.provider';

describe('ExportService', () => {
  let target: ExportService;
  let csvProvider: jest.Mocked<CsvProvider>;
  let pdfProvider: jest.Mocked<PdfProvider>;
  let excelProvider: jest.Mocked<ExcelProvider>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: CsvProvider, useValue: { generate: jest.fn() } },
        { provide: PdfProvider, useValue: { generate: jest.fn() } },
        { provide: ExcelProvider, useValue: { generate: jest.fn() } },
      ],
    }).compile();
    target = module.get(ExportService);
    csvProvider = module.get(CsvProvider);
    pdfProvider = module.get(PdfProvider);
    excelProvider = module.get(ExcelProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('exportToCsv', () => {
    it('delegates to the CSV provider and resolves with its buffer', async () => {
      const data = [{ id: 1, name: 'Alice' }];
      const options = { delimiter: ';' };
      const buffer = Buffer.from('id;name\r\n1;Alice');
      csvProvider.generate.mockReturnValue(buffer);

      const result = await target.exportToCsv(data, options);

      expect(csvProvider.generate).toHaveBeenCalledWith(data, options);
      expect(result).toBe(buffer);
    });

    it('works when no options are provided', async () => {
      const data = [{ id: 1 }];
      const buffer = Buffer.from('id\r\n1');
      csvProvider.generate.mockReturnValue(buffer);

      const result = await target.exportToCsv(data);

      expect(csvProvider.generate).toHaveBeenCalledWith(data, undefined);
      expect(result).toBe(buffer);
    });
  });

  describe('exportToPdf', () => {
    it('delegates to the PDF provider and resolves with its buffer', async () => {
      const data = { rows: [{ id: 1 }] };
      const options = { title: 'Report' };
      const buffer = Buffer.from('%PDF-1.4');
      pdfProvider.generate.mockResolvedValue(buffer);

      const result = await target.exportToPdf(data, options);

      expect(pdfProvider.generate).toHaveBeenCalledWith(data, options);
      expect(result).toBe(buffer);
    });

    it('propagates errors thrown by the PDF provider', async () => {
      const data = { rows: [] };
      pdfProvider.generate.mockRejectedValue(new Error('pdf failure'));

      await expect(target.exportToPdf(data)).rejects.toThrow('pdf failure');
    });
  });

  describe('exportToExcel', () => {
    it('delegates to the Excel provider and resolves with its buffer', async () => {
      const data = [{ id: 1, name: 'Bob' }];
      const options = { sheetName: 'Users' };
      const buffer = Buffer.from('PK...');
      excelProvider.generate.mockResolvedValue(buffer);

      const result = await target.exportToExcel(data, options);

      expect(excelProvider.generate).toHaveBeenCalledWith(data, options);
      expect(result).toBe(buffer);
    });

    it('propagates errors thrown by the Excel provider', async () => {
      excelProvider.generate.mockRejectedValue(new Error('excel failure'));

      await expect(target.exportToExcel([{ id: 1 }])).rejects.toThrow('excel failure');
    });
  });
});
