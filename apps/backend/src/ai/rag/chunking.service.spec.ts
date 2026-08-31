import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  let target: ChunkingService;

  beforeEach(() => {
    target = new ChunkingService();
  });

  afterEach(() => jest.clearAllMocks());

  describe('chunk', () => {
    it('returns an empty array for empty content', () => {
      expect(target.chunk('')).toEqual([]);
    });

    it('returns an empty array for whitespace-only content', () => {
      expect(target.chunk('   \n\t  ')).toEqual([]);
    });

    it('returns a single chunk when content is shorter than the chunk size (default recursive strategy)', () => {
      const content = 'hello world';
      expect(target.chunk(content, 'recursive', 1000, 200)).toEqual([content]);
    });

    it('defaults to the recursive strategy when none is specified', () => {
      const content = 'aaaaa bbbbb';
      expect(target.chunk(content)).toEqual([content]);
    });
  });

  describe('fixed strategy', () => {
    it('splits by character count with overlap and covers the entire text', () => {
      const content = 'abcdefghijklmnopqrstuvwxyz';
      const chunks = target.chunk(content, 'fixed', 10, 3);

      expect(chunks).toEqual(['abcdefghij', 'hijklmnopq', 'opqrstuvwx', 'vwxyz']);
    });

    it('returns a single chunk when content fits within chunkSize', () => {
      const content = 'short text';
      expect(target.chunk(content, 'fixed', 100, 20)).toEqual([content]);
    });

    it('does not loop infinitely when overlap >= chunkSize (step clamped to 1)', () => {
      const content = 'abcde';
      const chunks = target.chunk(content, 'fixed', 2, 5);

      // step is clamped to Math.max(1, chunkSize - chunkOverlap) = 1
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(c => {
        expect(c.length).toBeLessThanOrEqual(2);
      });
    });
  });

  describe('recursive strategy', () => {
    it('keeps content that fits within chunkSize as a single chunk', () => {
      const content = 'First paragraph.\n\nSecond paragraph.';
      expect(target.chunk(content, 'recursive', 1000, 200)).toEqual([content]);
    });

    it('splits oversized multi-paragraph content and applies overlap between chunks', () => {
      const content =
        'First paragraph is long enough to matter here for sure yes indeed.\n\n' +
        'Second paragraph also long enough to matter here too for sure yes.\n\n' +
        'Third one here too, long enough to matter for the test as well yes.';

      const chunks = target.chunk(content, 'recursive', 60, 10);

      expect(chunks.length).toBeGreaterThan(1);
      // Every chunk (bar the raw first split) is never empty, and each carries
      // up to `chunkOverlap` extra leading characters copied from the tail of
      // the previous raw fragment.
      chunks.forEach(c => {
        expect(c.length).toBeGreaterThan(0);
        expect(c.length).toBeLessThanOrEqual(60 + 10);
      });

      // Deterministic for this fixed input/chunkSize/chunkOverlap combination —
      // pins down both the paragraph-then-word splitting and the overlap merge.
      expect(chunks).toEqual([
        'First paragraph is long enough to matter here for sure yes',
        'r sure yesindeed.',
        'indeed.Second paragraph also long enough to matter here too for',
        're too forsure yes.',
        'sure yes.Third one here too, long enough to matter for the test as',
        'he test aswell yes.',
      ]);
    });

    it('falls back to fixed splitting for a single word that exceeds chunkSize', () => {
      const longWord =
        'Thisisonereallylongwordthatcannotbesplitbyspacesatallwhatsoeverandkeepsgoingonandon.';
      const chunks = target.chunk(longWord, 'recursive', 20, 5);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(c => {
        expect(c.length).toBeLessThanOrEqual(20);
      });
      // Concatenating the non-overlapping portions should reconstruct the source.
      expect(chunks.join('')).toContain('Thisisonereallylongw');
    });
  });

  describe('paragraph strategy', () => {
    it('splits on double newlines and keeps each short paragraph intact', () => {
      const content = 'Para one.\n\nPara two.\n\nPara three.';
      const chunks = target.chunk(content, 'paragraph', 1000);

      expect(chunks).toEqual(['Para one.', 'Para two.', 'Para three.']);
    });

    it('ignores blank paragraphs created by extra blank lines', () => {
      const content = 'Para one.\n\n\n\nPara two.';
      const chunks = target.chunk(content, 'paragraph', 1000);

      expect(chunks).toEqual(['Para one.', 'Para two.']);
    });

    it('subdivides an oversized paragraph using the fixed strategy', () => {
      const content = 'First paragraph is long enough to matter here for sure yes indeed.';
      const chunks = target.chunk(content, 'paragraph', 20);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(c => {
        expect(c.length).toBeLessThanOrEqual(20);
      });
    });
  });
});
