import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';

import { ExcelProvider } from './excel.provider';

describe('ExcelProvider', () => {
  let target: ExcelProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExcelProvider],
    }).compile();
    target = module.get(ExcelProvider);
  });

  afterEach(() => jest.clearAllMocks());

  async function readBack(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    // exceljs's own .d.ts declares an ambient, module-local `Buffer extends
    // ArrayBuffer` interface that shadows Node's global `Buffer` type within
    // that declaration file. That local type requires ArrayBuffer-only members
    // (maxByteLength/resizable/etc.) a real Node Buffer doesn't structurally
    // expose, so no cast to our own `Buffer` symbol can satisfy it — `any` is
    // the pragmatic escape hatch here; the runtime value is a plain Node Buffer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    await workbook.xlsx.load(buffer as any);
    return workbook;
  }

  describe('generate', () => {
    it('produces a valid workbook buffer for an empty data array', async () => {
      const buffer = await target.generate([]);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');
      expect(worksheet).toBeDefined();
      expect(worksheet?.rowCount).toBe(0);
    });

    it('uses a custom sheet name', async () => {
      const buffer = await target.generate([], { sheetName: 'MySheet' });
      const workbook = await readBack(buffer);
      expect(workbook.getWorksheet('MySheet')).toBeDefined();
    });

    it('writes header row and data rows using keys from the first row', async () => {
      const buffer = await target.generate([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);

      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');
      expect(worksheet).toBeDefined();

      const headerRow = worksheet?.getRow(1);
      expect(headerRow?.getCell(1).value).toBe('name');
      expect(headerRow?.getCell(2).value).toBe('age');
      expect(headerRow?.font).toEqual({ bold: true, size: 11 });

      const row2 = worksheet?.getRow(2);
      expect(row2?.getCell(1).value).toBe('Alice');
      expect(row2?.getCell(2).value).toBe(30);

      const row3 = worksheet?.getRow(3);
      expect(row3?.getCell(1).value).toBe('Bob');
      expect(row3?.getCell(2).value).toBe(25);
    });

    it('respects custom column selection and header mapping', async () => {
      const buffer = await target.generate([{ name: 'Alice', age: 30, extra: 'ignored' }], {
        columns: ['age', 'name'],
        headers: { name: 'Full Name', age: 'Age' },
      });

      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');
      const headerRow = worksheet?.getRow(1);
      expect(headerRow?.getCell(1).value).toBe('Age');
      expect(headerRow?.getCell(2).value).toBe('Full Name');

      const dataRow = worksheet?.getRow(2);
      expect(dataRow?.getCell(1).value).toBe(30);
      expect(dataRow?.getCell(2).value).toBe('Alice');
    });

    it('sets an autoFilter over the header row', async () => {
      const buffer = await target.generate([{ a: 1, b: 2 }]);
      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');
      expect(worksheet?.autoFilter).toBeDefined();
    });

    it('formats null/undefined as null cells, and leaves dates/numbers/booleans intact', async () => {
      const date = new Date('2024-01-15T10:00:00.000Z');
      const buffer = await target.generate([{ a: null, b: undefined, c: date, d: 42, e: true }]);
      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');
      const row = worksheet?.getRow(2);

      expect(row?.getCell(1).value).toBeNull();
      expect(row?.getCell(2).value).toBeNull();
      expect(row?.getCell(3).value).toBeInstanceOf(Date);
      expect(row?.getCell(4).value).toBe(42);
      expect(row?.getCell(5).value).toBe(true);
    });

    it('formats bigint values via toString and objects/arrays via JSON.stringify', async () => {
      const buffer = await target.generate([
        { big: 9007199254740993n, obj: { x: 1 }, arr: [1, 2] },
      ]);
      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');
      const row = worksheet?.getRow(2);

      expect(row?.getCell(1).value).toBe('9007199254740993');
      expect(row?.getCell(2).value).toBe('{"x":1}');
      expect(row?.getCell(3).value).toBe('[1,2]');
    });

    it('auto-fits column width between MIN and MAX bounds based on content length', async () => {
      const longValue = 'x'.repeat(100);
      const buffer = await target.generate([{ short: 'a', long: longValue }]);
      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');

      const shortCol = worksheet?.getColumn(1);
      const longCol = worksheet?.getColumn(2);

      expect(shortCol?.width).toBeGreaterThanOrEqual(10);
      expect(longCol?.width).toBe(50);
    });

    it('measures object-typed cell values (e.g. Date) via JSON stringification for width calculation', async () => {
      // Date survives formatValue() as a Date instance, so getCellDisplayLength's
      // `typeof value === 'object'` branch (JSON.stringify) is what measures it.
      const date = new Date('2024-01-15T10:00:00.000Z');
      const buffer = await target.generate([{ c: date }]);
      const workbook = await readBack(buffer);
      const worksheet = workbook.getWorksheet('Sheet1');
      const col = worksheet?.getColumn(1);

      const expectedLength = JSON.stringify(date).length;
      expect(col?.width).toBe(Math.min(expectedLength + 2, 50));
    });
  });
});
