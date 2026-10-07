import { buildExportFilename } from './export-filename.util';

describe('buildExportFilename', () => {
  const day = new Date('2026-10-07T09:30:00.000Z');

  it('slugs the business name and appends the date', () => {
    expect(buildExportFilename('Acme Dental & Sons', day)).toBe(
      'innopeak-export-acme-dental-sons-2026-10-07.json'
    );
  });

  it('strips accents and anything that could break or inject into a header', () => {
    const name = buildExportFilename('Café "Müller"\r\nSet-Cookie: x=1', day);

    expect(name).toBe('innopeak-export-cafe-muller-set-cookie-x-1-2026-10-07.json');
    expect(name).not.toMatch(/[\r\n"]/);
  });

  it('falls back when nothing usable is left, and caps a very long name', () => {
    expect(buildExportFilename('★★★', day)).toBe('innopeak-export-business-2026-10-07.json');
    expect(buildExportFilename('a'.repeat(200), day).length).toBeLessThan(80);
  });
});
