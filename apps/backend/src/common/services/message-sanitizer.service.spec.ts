import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { MessageSanitizer } from './message-sanitizer.service';

describe('MessageSanitizer', () => {
  let target: MessageSanitizer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageSanitizer],
    }).compile();
    target = module.get(MessageSanitizer);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sanitizeMessage', () => {
    it('returns an empty string when given an empty string', () => {
      expect(target.sanitizeMessage('')).toBe('');
    });

    it('leaves already-clean plain text untouched', () => {
      const clean = 'Hello, this is a perfectly normal message.';

      expect(target.sanitizeMessage(clean)).toBe(clean);
    });

    it('strips script tags and their contents is not guaranteed but tags are removed', () => {
      const malicious = '<script>alert("xss")</script>Hello';

      const result = target.sanitizeMessage(malicious);

      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
      expect(result).toContain('Hello');
    });

    it('strips arbitrary HTML tags while keeping text content', () => {
      const html = '<b>bold</b> and <i>italic</i> <a href="http://evil.com">link</a>';

      const result = target.sanitizeMessage(html);

      expect(result).toBe('bold and italic link');
    });

    it('removes disallowed attributes such as onerror handlers', () => {
      const malicious = '<img src="x" onerror="alert(1)">';

      const result = target.sanitizeMessage(malicious);

      expect(result).not.toContain('onerror');
      expect(result).not.toContain('<img');
    });
  });
});
