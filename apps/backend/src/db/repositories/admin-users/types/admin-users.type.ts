import type { UserRole } from '@auth/enums/user-role.enum';
import type { UserStatus } from '@auth/enums/user-status.enum';

export interface AdminUserRow {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** Most recent `refresh_tokens.created_at` for this user — see `findAll`'s own comment for why
   * this stands in for a real `last_login_at` column, which does not exist on `users`. */
  lastLoginAt: string | null;
}

/** `removal_pending` is distinct from `not_found` — the row exists, but has an active team-member
 *  removal request pending (`erasure_requested_at` set) — see `AdminUsersRepository.toggleActive`. */
export type ToggleActiveOutcome =
  { outcome: 'not_found' } | { outcome: 'removal_pending' } | { outcome: 'toggled' };

/** `AdminUsersDbService.toggleActive`'s own outcome — derived from `ToggleActiveOutcome` rather
 *  than redeclared, so a future failure branch added to the repository's type can never be
 *  forgotten here; only the success case is overridden, carrying the re-read row instead of
 *  nothing. */
export type ToggleActiveResult =
  Exclude<ToggleActiveOutcome, { outcome: 'toggled' }> | { outcome: 'toggled'; row: AdminUserRow };
