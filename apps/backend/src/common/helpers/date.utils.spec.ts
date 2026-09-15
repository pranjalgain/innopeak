import { toIsoString, toIsoStringOrNull } from './date.utils';

describe('toIsoString', () => {
  /** The exact shape Drizzle's `mode: 'string'` timestamps come back as — see the helper's doc. */
  it('normalises Postgres text timestamps to ISO-8601', () => {
    expect(toIsoString('2026-09-11 11:00:20.346998+00')).toBe('2026-09-11T11:00:20.346Z');
  });

  it('preserves the instant when the offset is not UTC', () => {
    expect(toIsoString('2026-09-11 13:00:20+02')).toBe('2026-09-11T11:00:20.000Z');
  });

  it('leaves an already-ISO string unchanged', () => {
    expect(toIsoString('2026-09-11T11:00:20.346Z')).toBe('2026-09-11T11:00:20.346Z');
  });

  /** A DTO must not fail a request over a display format — see the helper's doc. */
  it('returns an unparseable value unchanged rather than "Invalid Date"', () => {
    expect(toIsoString('not a timestamp')).toBe('not a timestamp');
  });
});

describe('toIsoStringOrNull', () => {
  it('passes null through', () => {
    expect(toIsoStringOrNull(null)).toBeNull();
  });

  it('normalises a present value', () => {
    expect(toIsoStringOrNull('2026-09-11 11:00:20.346998+00')).toBe('2026-09-11T11:00:20.346Z');
  });
});
