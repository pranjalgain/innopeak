import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { Injectable } from '@nestjs/common';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import { BusinessNotFoundException } from '../exceptions/admin.exceptions';

export interface SetBusinessStatusParams {
  tenantId: string;
  status: BusinessStatus;
}

@Injectable()
export class AdminBusinessesService {
  constructor(
    private readonly adminBusinessesDbService: AdminBusinessesDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService
  ) {}

  async list(actor: AuthUser): Promise<AdminBusinessResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const summaries = await this.adminBusinessesDbService.findAll();
    return summaries.map(summary => AdminBusinessResponseDto.from(summary));
  }

  /**
   * `status` here is the frontend's simplified `BusinessStatus` (active/suspended); mapped to the
   * real 3-value `TenantStatus` before writing — `active` always lands on `TenantStatus.ACTIVE`,
   * never back on `pending_activation`, since re-activating a suspended business means proceeding
   * to normal operation, not un-suspending it into an onboarding state it may have left long ago.
   *
   * Recorded to `platform_activity_log` on success — the Super Admin Overview page's "Activity"
   * panel reads this back. Logged after the write, not before: a failed/not-found update has
   * nothing to log.
   */
  async setStatus(
    actor: AuthUser,
    params: SetBusinessStatusParams
  ): Promise<AdminBusinessResponseDto> {
    const { tenantId, status } = params;
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const tenantStatus =
      status === BusinessStatus.SUSPENDED ? TenantStatus.SUSPENDED : TenantStatus.ACTIVE;
    const summary = await this.adminBusinessesDbService.setStatus({
      tenantId,
      status: tenantStatus,
    });
    if (!summary) {
      throw new BusinessNotFoundException();
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type:
        status === BusinessStatus.SUSPENDED
          ? PlatformActivityType.BUSINESS_SUSPENDED
          : PlatformActivityType.BUSINESS_REACTIVATED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      tenantId,
      // Snapshotted from the row we just wrote, so the entry still reads correctly after this
      // business is renamed or deleted — see `platform_activity_log.business_name`.
      businessName: summary.name,
    });

    return AdminBusinessResponseDto.from(summary);
  }
}
