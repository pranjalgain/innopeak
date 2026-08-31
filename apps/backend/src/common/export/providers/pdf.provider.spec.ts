import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PdfProvider } from './pdf.provider';

import type { ExportData } from '../interfaces/export.interface';

describe('PdfProvider', () => {
  let target: PdfProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfProvider],
    }).compile();
    target = module.get(PdfProvider);
  });

  afterEach(() => jest.clearAllMocks());

  function isPdfBuffer(buffer: Buffer): boolean {
    return buffer.subarray(0, 5).toString('utf-8') === '%PDF-';
  }

  describe('generate', () => {
    it('produces a valid PDF buffer for representative row data', async () => {
      const data: ExportData = {
        rows: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
      };

      const buffer = await target.generate(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(isPdfBuffer(buffer)).toBe(true);
    });

    it('produces a valid (non-empty) PDF for an empty dataset', async () => {
      const data: ExportData = { rows: [] };
      const buffer = await target.generate(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(isPdfBuffer(buffer)).toBe(true);
    });

    it('renders with a title and subtitle when provided', async () => {
      const data: ExportData = { rows: [{ a: 1 }] };
      const buffer = await target.generate(data, { title: 'Report', subtitle: 'Sub' });
      expect(isPdfBuffer(buffer)).toBe(true);
    });

    it('supports explicit columns/headers options overriding data-derived ones', async () => {
      const data: ExportData = { rows: [{ a: 1, b: 2 }], columns: ['a', 'b'], headers: { a: 'A' } };
      const buffer = await target.generate(data, { columns: ['b'], headers: { b: 'B col' } });
      expect(isPdfBuffer(buffer)).toBe(true);
    });

    it('supports landscape orientation and Letter page size', async () => {
      const data: ExportData = { rows: [{ a: 1 }] };
      const buffer = await target.generate(data, { orientation: 'landscape', pageSize: 'Letter' });
      expect(isPdfBuffer(buffer)).toBe(true);
    });

    it('paginates across multiple pages when there are many rows', async () => {
      const rows = Array.from({ length: 60 }, (_, i) => ({ index: i, value: `row-${i}` }));
      const data: ExportData = { rows };
      const buffer = await target.generate(data);
      expect(isPdfBuffer(buffer)).toBe(true);
      // A larger row count should yield a meaningfully larger PDF than a single row.
      const smallBuffer = await target.generate({ rows: [{ index: 0, value: 'row-0' }] });
      expect(buffer.length).toBeGreaterThan(smallBuffer.length);
    });

    it('formats null/undefined, dates, numbers, booleans, bigints, and objects for cell values', async () => {
      const data: ExportData = {
        rows: [
          {
            a: null,
            b: undefined,
            c: new Date('2024-01-15T10:00:00.000Z'),
            d: 42,
            e: true,
            f: BigInt(123),
            g: { x: 1 },
          },
        ],
      };
      const buffer = await target.generate(data);
      expect(isPdfBuffer(buffer)).toBe(true);
    });

    it('rejects with an Error when given a page size unknown to pdfkit', async () => {
      // PAGE_SIZES falls back to 'A4' internally, so dimensions are always
      // resolved on our side; an invalid `pageSize` string is still passed
      // through to PDFDocument itself, which throws synchronously when it
      // can't find the size in its own lookup table. The outer try/catch in
      // generate() should catch that and reject with a wrapped Error rather
      // than let the exception escape or hang the returned promise.
      const data: ExportData = { rows: [{ a: 1 }] };
      await expect(
        target.generate(data, { pageSize: 'Unsupported' as unknown as 'A4' })
      ).rejects.toBeInstanceOf(Error);
    });

    it('wraps a non-Error rejection reason in an Error', async () => {
      // Force an internal failure by making PDFDocument's `.font()` call throw a
      // non-Error value, which the generate() catch block should wrap.
      const PDFDocument = (await import('pdfkit')).default;
      const fontSpy = jest.spyOn(PDFDocument.prototype, 'font').mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'non-error rejection';
      });

      const data: ExportData = { rows: [{ a: 1 }], columns: ['a'] };

      await expect(target.generate(data, { title: 'Title' })).rejects.toThrow(
        'Unknown PDF generation error'
      );

      fontSpy.mockRestore();
    });
  });
});
