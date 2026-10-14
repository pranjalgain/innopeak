import { createHash } from 'crypto';

/**
 * A UUID derived from `key`, the same every time. Used as the generation group of notices that have no natural one, so the unique
 * index `idx_in_app_notifications_dedupe (user_id, type, review_id, generation_group_id)` can actually stop a repeat: a NULL group
 * never conflicts (NULLs are distinct), so without this a re-run would write the notice again for every user.
 * Shaped as a version 8 (custom) UUID so it is valid for the `uuid` column.
 */
export function deterministicUuid(key: string): string {
  const bytes = createHash('sha256').update(key).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
