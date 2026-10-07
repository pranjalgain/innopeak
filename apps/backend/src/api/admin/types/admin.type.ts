import type { BusinessStatus } from '@common/enums/business-status.enum';

import type { AdminInviteResponseDto } from '../dto/admin-invite-response.dto';

export interface SetBusinessStatusParams {
  tenantId: string;
  status: BusinessStatus;
}

export interface SetAdminStatusParams {
  targetAdminId: string;
  enabled: boolean;
}

/** `message` is picked by the service so the controller never branches on `enabled`. */
export interface SetAdminStatusResult {
  admin: AdminInviteResponseDto;
  message: string;
}
