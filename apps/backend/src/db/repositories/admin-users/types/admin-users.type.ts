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
  /** Newest `refresh_tokens.created_at`; stands in for a `last_login_at` column that doesn't exist. */
  lastLoginAt: string | null;
}

/** `removal_pending`: the row exists but has an active team-member removal request (`erasure_requested_at` set). */
export type ToggleActiveOutcome =
  { outcome: 'not_found' } | { outcome: 'removal_pending' } | { outcome: 'toggled' };

/** Derived from `ToggleActiveOutcome` so a new failure branch there can't be forgotten here. */
export type ToggleActiveResult =
  Exclude<ToggleActiveOutcome, { outcome: 'toggled' }> | { outcome: 'toggled'; row: AdminUserRow };
