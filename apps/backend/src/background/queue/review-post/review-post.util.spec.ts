import { normalizeReplyText } from './review-post.util';

describe('normalizeReplyText', () => {
  it('collapses whitespace runs, line breaks and surrounding space', () => {
    expect(normalizeReplyText('  a \r\n b\n\n c  ')).toBe('a b c');
  });

  it('keeps genuinely different text different', () => {
    expect(normalizeReplyText('Thanks!')).not.toBe(normalizeReplyText('Thank you!'));
  });
});
