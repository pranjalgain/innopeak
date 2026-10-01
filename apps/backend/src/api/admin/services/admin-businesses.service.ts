import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { MESSAGES } from '@common/constants/messages.constants';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { EnvConfig } from '@config/env.config';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthUser } from '../../auth/types/auth.type';
import { AdminBusinessResponseDto } from '../dto/admin-business-response.dto';
import type { ListAdminBusinessesQueryDto } from '../dto/list-admin-businesses-query.dto';
import {
  BusinessErasurePendingException,
  BusinessNotFoundException,
} from '../exceptions/admin.exceptions';
import type { SetBusinessStatusParams } from '../types/admin.type';

@Injectable()
export class AdminBusinessesService {
  constructor(
    private readonly adminBusinessesDbService: AdminBusinessesDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  async list(
    actor: AuthUser,
    query: ListAdminBusinessesQueryDto
  ): Promise<AdminBusinessResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const summaries = await this.adminBusinessesDbService.findAll(query.search);
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
    const result = await this.adminBusinessesDbService.setStatus({
      tenantId,
      status: tenantStatus,
    });
    if (result.outcome === 'not_found') {
      throw new BusinessNotFoundException();
    }
    if (result.outcome === 'erasure_pending') {
      throw new BusinessErasurePendingException();
    }
    const { summary } = result;

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

  /**
   * Suspends the tenant immediately and starts its grace period — every user in it loses access
   * now. The actual anonymization happens later, in the nightly erasure-purge cron job, once
   * `ERASURE_GRACE_PERIOD_DAYS` has elapsed; cancellable any time before then via `cancelErasure`.
   *
   * A `null` result (repository scoped off an already-`erased` tenant, or a plain not-found)
   * collapses to the same `BusinessNotFoundException` `setStatus` uses for its own not-found case
   * — an already-erased tenant has nothing further to request, and reads the same to the caller as
   * one that never existed.
   */
  async requestErasure(
    actor: AuthUser,
    tenantId: string
  ): Promise<{ business: AdminBusinessResponseDto; gracePeriodDays: number }> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const summary = await this.adminBusinessesDbService.requestErasure(tenantId);
    if (!summary) {
      throw new BusinessNotFoundException();
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.BUSINESS_ERASURE_REQUESTED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      tenantId,
      businessName: summary.name,
    });

    return {
      business: AdminBusinessResponseDto.from(summary),
      gracePeriodDays: this.gracePeriodDays(),
    };
  }

  /** Undoes `requestErasure` — a clean, full undo, since nothing is anonymized until the grace
   *  period actually elapses. */
  async cancelErasure(actor: AuthUser, tenantId: string): Promise<AdminBusinessResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const summary = await this.adminBusinessesDbService.cancelErasure(tenantId);
    if (!summary) {
      throw new BusinessNotFoundException();
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.BUSINESS_ERASURE_CANCELLED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      tenantId,
      businessName: summary.name,
    });

    return AdminBusinessResponseDto.from(summary);
  }

  private gracePeriodDays(): number {
    return getErasureGracePeriodDays(this.configService);
  }
}
