import type { BusinessStatus } from '@common/enums/business-status.enum';

import type { AdminInviteResponseDto } from '../dto/admin-invite-response.dto';

// ─── Businesses ───────────────────────────────────────────────────────────

export interface SetBusinessStatusParams {
  tenantId: string;
  status: BusinessStatus;
}

// ─── Settings ─────────────────────────────────────────────────────────────

export interface SetAdminStatusParams {
  targetAdminId: string;
  enabled: boolean;
}

/** `message` rides along so the controller never has to branch on `enabled` itself to pick
 *  between `MESSAGES.ADMIN.ADMIN_ENABLED`/`ADMIN_DISABLED` — that decision belongs here. */
export interface SetAdminStatusResult {
  admin: AdminInviteResponseDto;
  message: string;
}
