/**
 * Collapses whitespace so two renderings of a reply compare equal: Google may normalize whitespace
 * in a stored reply, so an exact `===` could misread our own post as someone else's.
 */
export function normalizeReplyText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
