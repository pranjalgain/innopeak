import { Injectable } from '@nestjs/common';

type ChunkingStrategy = 'fixed' | 'paragraph' | 'recursive';

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

/**
 * Splits text content into smaller chunks for embedding.
 *
 * Three strategies are supported:
 * - **fixed**: split by character count with configurable overlap
 * - **recursive**: split by paragraphs, then sentences, then characters
 * - **paragraph**: split on double newlines (natural paragraph boundaries)
 *
 * This service performs NO database calls.
 */
@Injectable()
export class ChunkingService {
  /**
   * Chunk the given content using the specified strategy.
   *
   * @returns Non-empty array of text chunks. Empty content yields an empty array.
   */
  chunk(
    content: string,
    strategy: ChunkingStrategy = 'recursive',
    chunkSize: number = DEFAULT_CHUNK_SIZE,
    chunkOverlap: number = DEFAULT_CHUNK_OVERLAP
  ): string[] {
    if (!content.trim()) {
      return [];
    }

    switch (strategy) {
      case 'fixed':
        return this.fixedChunk(content, chunkSize, chunkOverlap);
      case 'recursive':
        return this.recursiveChunk(content, chunkSize, chunkOverlap);
      case 'paragraph':
        return this.paragraphChunk(content, chunkSize);
      default: {
        // Exhaustiveness check — will never reach here if types are correct
        const _exhaustive: never = strategy;
        return _exhaustive;
      }
    }
  }

  // ─── Fixed Strategy ─────────────────────────────────────────────────────────

  /**
   * Split by raw character count with overlap.
   * Guaranteed to cover the entire text.
   */
  private fixedChunk(content: string, chunkSize: number, chunkOverlap: number): string[] {
    const chunks: string[] = [];
    const step = Math.max(1, chunkSize - chunkOverlap);
    let start = 0;

    while (start < content.length) {
      const end = Math.min(start + chunkSize, content.length);
      const slice = content.slice(start, end).trim();
      if (slice.length > 0) {
        chunks.push(slice);
      }
      // If we reached the end, break to avoid infinite loop when step < remaining
      if (end >= content.length) {
        break;
      }
      start += step;
    }

    return chunks;
  }

  // ─── Recursive Strategy ─────────────────────────────────────────────────────

  /**
   * Attempts to split by the largest semantic unit that fits within chunkSize:
   *   1. paragraphs (double newline)
   *   2. sentences (period / question mark / exclamation followed by space)
   *   3. words (whitespace)
   *   4. characters (fallback)
   *
   * Fragments that exceed chunkSize are recursively split with the next finer
   * separator. Finally, small adjacent fragments are merged with overlap.
   */
  private recursiveChunk(content: string, chunkSize: number, chunkOverlap: number): string[] {
    const separators = ['\n\n', '\n', '. ', '? ', '! ', ' ', ''];

    const splitRecursively = (text: string, separatorIndex: number): string[] => {
      if (text.length <= chunkSize) {
        return [text];
      }

      const separator = separators[separatorIndex];

      // If we've exhausted all separators, fall back to fixed splitting
      if (separator === undefined || separator === '') {
        return this.fixedChunk(text, chunkSize, chunkOverlap);
      }

      const parts = text.split(separator);
      const result: string[] = [];
      let current = '';

      for (const part of parts) {
        const candidate = current.length > 0 ? `${current}${separator}${part}` : part;

        if (candidate.length <= chunkSize) {
          current = candidate;
        } else {
          // Flush current buffer
          if (current.length > 0) {
            result.push(current);
          }

          // If the individual part exceeds chunkSize, recurse with a finer separator
          if (part.length > chunkSize) {
            const subChunks = splitRecursively(part, separatorIndex + 1);
            result.push(...subChunks);
            current = '';
          } else {
            current = part;
          }
        }
      }

      if (current.trim().length > 0) {
        result.push(current);
      }

      return result;
    };

    const rawChunks = splitRecursively(content, 0);

    // Apply overlap by merging trailing/leading text between adjacent chunks
    return this.applyOverlap(rawChunks, chunkOverlap);
  }

  // ─── Paragraph Strategy ─────────────────────────────────────────────────────

  /**
   * Split on double newlines. Paragraphs that exceed chunkSize are split
   * further using the fixed strategy with a moderate overlap.
   */
  private paragraphChunk(content: string, chunkSize: number): string[] {
    const paragraphs = content.split(/\n\s*\n/);
    const chunks: string[] = [];

    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (trimmed.length === 0) {
        continue;
      }

      if (trimmed.length <= chunkSize) {
        chunks.push(trimmed);
      } else {
        // Oversized paragraph — subdivide with fixed strategy and moderate overlap
        const subOverlap = Math.min(Math.floor(chunkSize * 0.2), 200);
        const subChunks = this.fixedChunk(trimmed, chunkSize, subOverlap);
        chunks.push(...subChunks);
      }
    }

    return chunks;
  }

  // ─── Overlap Helper ─────────────────────────────────────────────────────────

  /**
   * Prepend trailing text from the previous chunk to the current chunk
   * so that context is preserved across chunk boundaries.
   */
  private applyOverlap(chunks: string[], overlapSize: number): string[] {
    if (overlapSize <= 0 || chunks.length <= 1) {
      return chunks.filter(c => c.trim().length > 0);
    }

    const result: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk === undefined) {
        continue;
      }

      if (i === 0) {
        result.push(chunk);
        continue;
      }

      const prevChunk = chunks[i - 1];
      if (prevChunk === undefined) {
        result.push(chunk);
        continue;
      }
      const overlapText = prevChunk.slice(-overlapSize);

      // Avoid duplicating if the chunk already starts with the overlap text
      if (chunk.startsWith(overlapText)) {
        result.push(chunk);
      } else {
        result.push(`${overlapText}${chunk}`);
      }
    }

    return result.filter(c => c.trim().length > 0);
  }
}
