/**
 * Collapses whitespace runs and trims, so two renderings of the same reply compare equal. Google
 * may normalize line endings or surrounding whitespace in a stored reply, so an exact `===` against
 * what this app sent can misread its own earlier post as someone else's.
 */
export function normalizeReplyText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
