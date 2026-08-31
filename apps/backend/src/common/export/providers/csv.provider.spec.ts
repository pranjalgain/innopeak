import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { CsvProvider } from './csv.provider';

describe('CsvProvider', () => {
  let target: CsvProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CsvProvider],
    }).compile();
    target = module.get(CsvProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generate', () => {
    it('returns an empty buffer for an empty data array', () => {
      const result = target.generate([]);
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString('utf-8')).toBe('');
    });

    it('generates a CSV with a BOM, header row, and data rows using keys from the first row', () => {
      const result = target.generate([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);

      const content = result.toString('utf-8');
      expect(content.startsWith('﻿')).toBe(true);

      const lines = content.slice(1).split('\r\n');
      expect(lines).toEqual(['name,age', 'Alice,30', 'Bob,25']);
    });

    it('respects a custom column order and header mapping', () => {
      const result = target.generate([{ name: 'Alice', age: 30 }], {
        columns: ['age', 'name'],
        headers: { name: 'Full Name', age: 'Age' },
      });

      const content = result.toString('utf-8').slice(1);
      const lines = content.split('\r\n');
      expect(lines).toEqual(['Age,Full Name', '30,Alice']);
    });

    it('omits the header row when includeHeaders is false', () => {
      const result = target.generate([{ name: 'Alice' }], { includeHeaders: false });
      const content = result.toString('utf-8').slice(1);
      expect(content).toBe('Alice');
    });

    it('supports a custom delimiter', () => {
      const result = target.generate([{ a: 1, b: 2 }], { delimiter: ';' });
      const content = result.toString('utf-8').slice(1);
      expect(content).toBe('a;b\r\n1;2');
    });

    it('escapes fields containing the delimiter, quotes, or newlines', () => {
      const result = target.generate([
        { note: 'has, comma' },
        { note: 'has "quote"' },
        { note: 'line1\nline2' },
      ]);
      const content = result.toString('utf-8').slice(1);
      const lines = content.split('\r\n');
      expect(lines[0]).toBe('note');
      expect(lines[1]).toBe('"has, comma"');
      expect(lines[2]).toBe('"has ""quote"""');
      expect(lines[3]).toBe('"line1\nline2"');
    });

    it('formats null and undefined values as empty strings', () => {
      const result = target.generate([{ a: null, b: undefined }]);
      const content = result.toString('utf-8').slice(1);
      expect(content).toBe('a,b\r\n,');
    });

    it('formats Date values as ISO strings', () => {
      const date = new Date('2024-01-15T10:00:00.000Z');
      const result = target.generate([{ createdAt: date }]);
      const content = result.toString('utf-8').slice(1);
      expect(content).toBe(`createdAt\r\n${date.toISOString()}`);
    });

    it('formats numbers, booleans, and bigints via toString', () => {
      const result = target.generate([{ n: 42, b: true, big: 9007199254740993n }]);
      const content = result.toString('utf-8').slice(1);
      expect(content).toBe('n,b,big\r\n42,true,9007199254740993');
    });

    it('formats objects and arrays as JSON', () => {
      const result = target.generate([{ obj: { x: 1 }, arr: [1, 2] }]);
      const content = result.toString('utf-8').slice(1);
      const lines = content.split('\r\n');
      expect(lines[1]).toBe('"{""x"":1}","[1,2]"');
    });
  });
});
