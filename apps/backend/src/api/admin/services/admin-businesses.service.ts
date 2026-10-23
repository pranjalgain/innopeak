import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { ErasureNoticeService } from '@auth/services/erasure-notice.service';
import { SessionRevocationService } from '@auth/services/session-revocation.service';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { MESSAGES } from '@common/constants/messages.constants';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { EnvConfig } from '@config/env.config';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthUser } from '../../auth/types/auth.type';
import { ADMIN_LIST_PAGE_SIZE_DEFAULT } from '../constants/admin-overview.constants';
import {
  AdminBusinessListResponseDto,
  AdminBusinessResponseDto,
} from '../dto/admin-business-response.dto';
import type { ListAdminBusinessesQueryDto } from '../dto/list-admin-businesses-query.dto';
import {
  BusinessErasureNotPendingException,
  BusinessErasurePendingException,
  BusinessNotFoundException,
} from '../exceptions/admin.exceptions';
import type { SetBusinessStatusParams } from '../types/admin.type';

@Injectable()
export class AdminBusinessesService {
  private readonly logger = new Logger(AdminBusinessesService.name);

  constructor(
    private readonly adminBusinessesDbService: AdminBusinessesDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly billingReconciliationService: BillingReconciliationService,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly erasureNoticeService: ErasureNoticeService,
    private readonly sessionRevocationService: SessionRevocationService
  ) {}

  async list(
    actor: AuthUser,
    query: ListAdminBusinessesQueryDto
  ): Promise<AdminBusinessListResponseDto> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? ADMIN_LIST_PAGE_SIZE_DEFAULT;

    const { businesses, total } = await this.adminBusinessesDbService.findPage({
      search: query.search,
      page,
      pageSize,
    });

    return {
      businesses: businesses.map(summary => AdminBusinessResponseDto.from(summary)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  /**
   * `status` is the frontend's simplified BusinessStatus; `active` always maps to TenantStatus.ACTIVE, never back to pending_activation.
   * Logged after the write, so a not-found update logs nothing. Setting the status a business already has is a no-op:
   * it answers like the first call but writes no activity entry.
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

    // A suspended business's users must lose access now, not when their access tokens happen to lapse.
    if (result.changed && tenantStatus === TenantStatus.SUSPENDED) {
      await this.sessionRevocationService.revokeTenant(tenantId);
    }

    if (result.changed) {
      await this.adminOverviewDbService.recordActivityBestEffort({
        type:
          status === BusinessStatus.SUSPENDED
            ? PlatformActivityType.BUSINESS_SUSPENDED
            : PlatformActivityType.BUSINESS_REACTIVATED,
        actorPlatformAdminId: admin.id,
        actorEmail: admin.email,
        tenantId,
        // Snapshot of the name, so the entry survives a later rename or delete.
        businessName: summary.name,
      });
    }

    return AdminBusinessResponseDto.from(summary);
  }

  /**
   * Suspends immediately; anonymization happens in the nightly purge after `ERASURE_GRACE_PERIOD_DAYS`.
   * An already-erased tenant reads as not found. Asking again while the request is already pending answers like the
   * first call but does nothing more: no second subscription change, activity entry or notice to the owners, and the
   * grace period is not restarted.
   */
  async requestErasure(
    actor: AuthUser,
    tenantId: string
  ): Promise<{ business: AdminBusinessResponseDto; gracePeriodDays: number }> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const result = await this.adminBusinessesDbService.requestErasure(tenantId);
    if (result.outcome === 'not_found') {
      throw new BusinessNotFoundException();
    }
    const { summary } = result;
    if (result.outcome === 'already_requested') {
      return {
        business: AdminBusinessResponseDto.from(summary),
        gracePeriodDays: this.gracePeriodDays(),
      };
    }

    // The business is suspended by this request: end its users' sessions now.
    await this.sessionRevocationService.revokeTenant(tenantId);

    // Best-effort: the request already took effect and the purge deletes the Stripe customer anyway,
    // so a Stripe hiccup must not fail it.
    try {
      await this.billingReconciliationService.scheduleCancellationForErasure(tenantId);
    } catch (error) {
      this.logger.warn(
        `Could not schedule subscription cancellation for tenant ${tenantId} on erasure request: ${(error as Error).message}`
      );
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.BUSINESS_ERASURE_REQUESTED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      tenantId,
      businessName: summary.name,
    });

    await this.erasureNoticeService.notifyScheduled({
      tenantId,
      businessName: summary.name,
      requestedBy: 'admin',
    });

    return {
      business: AdminBusinessResponseDto.from(summary),
      gracePeriodDays: this.gracePeriodDays(),
    };
  }

  async cancelErasure(actor: AuthUser, tenantId: string): Promise<AdminBusinessResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const result = await this.adminBusinessesDbService.cancelErasure(tenantId);
    if (result.outcome === 'not_found') {
      throw new BusinessNotFoundException();
    }
    if (result.outcome === 'not_pending') {
      throw new BusinessErasureNotPendingException();
    }
    const { summary } = result;

    // Resumes only a subscription the erasure itself set to end, never one the owner cancelled.
    // Best-effort: a Stripe hiccup must not fail the cancel (worst case the owner re-subscribes).
    try {
      await this.billingReconciliationService.resumeAfterErasureCancelled(tenantId);
    } catch (error) {
      this.logger.warn(
        `Could not resume subscription for tenant ${tenantId} after erasure was cancelled: ${(error as Error).message}`
      );
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.BUSINESS_ERASURE_CANCELLED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      tenantId,
      businessName: summary.name,
    });

    await this.erasureNoticeService.notifyCancelled({ tenantId, businessName: summary.name });

    return AdminBusinessResponseDto.from(summary);
  }

  private gracePeriodDays(): number {
    return getErasureGracePeriodDays(this.configService);
  }
}
