import { UserStatus } from '@auth/enums/user-status.enum';
import {
  AccountDisabledException,
  TenantSuspendedException,
} from '@auth/exceptions/auth.exceptions';
import type { AuthUser } from '@auth/types/auth.type';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { isTenantLoginBlocked } from '@auth/utils/tenant-status.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { TenantExportDbService } from '@db/repositories/tenant-export/tenant-export.db-service';
import { Injectable, Logger } from '@nestjs/common';

import { Readable } from 'stream';

import {
  EXPORT_FORMAT,
  EXPORT_REVIEW_BATCH_SIZE,
  EXPORT_VERSION,
} from '../constants/tenant-export.constants';
import { buildExportFilename } from '../utils/export-filename.util';

export interface TenantExport {
  filename: string;
  /** Lazy: nothing is read from the database until consumed. */
  stream: Readable;
}

/** Streamed (small sections, then reviews in keyset batches) so a huge review history costs the same memory as an empty one. */
@Injectable()
export class TenantExportService {
  private readonly logger = new Logger(TenantExportService.name);

  constructor(
    private readonly tenantExportDbService: TenantExportDbService,
    private readonly authDbService: AuthDbService
  ) {}

  async exportData(actor: AuthUser): Promise<TenantExport> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);

    // Tokens are stateless: a since-disabled user must not export with a token minted earlier.
    const user = await this.authDbService.findUserById(owner.id);
    if (!user || user.status === UserStatus.DISABLED) {
      throw new AccountDisabledException();
    }

    // Same for a suspended business (erasure pending or admin suspension).
    const tenant = await this.authDbService.findTenantStatus(owner.tenantId);
    if (isTenantLoginBlocked(tenant)) {
      throw new TenantSuspendedException();
    }

    const sections = await this.tenantExportDbService.getSections(owner.tenantId);
    const now = new Date();
    const stream = Readable.from(this.chunks(owner.tenantId, sections, now), { objectMode: false });
    stream.on('error', error => {
      this.logger.error(
        `Data export for tenant ${owner.tenantId} failed mid-stream: ${error.message}`
      );
    });

    return { filename: buildExportFilename(sections.business?.name ?? '', now), stream };
  }

  private async *chunks(
    tenantId: string,
    sections: Awaited<ReturnType<TenantExportDbService['getSections']>>,
    now: Date
  ): AsyncGenerator<string> {
    const head = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      business: sections.business,
      team: sections.team,
      settings: sections.settings,
      blocklist: sections.blocklist,
      notificationRecipients: sections.notificationRecipients,
      locations: sections.locations,
      prompts: sections.prompts,
    };
    // Everything but the closing brace of the head object, so `reviews` and `billing` can follow.
    yield `${JSON.stringify(head).slice(0, -1)},"reviews":[`;

    let afterId: string | null = null;
    let first = true;
    for (;;) {
      const { reviews } = await this.tenantExportDbService.getReviewBatch({
        tenantId,
        afterId,
        limit: EXPORT_REVIEW_BATCH_SIZE,
      });
      if (reviews.length === 0) {
        break;
      }
      yield reviews
        .map((review, index) => (first && index === 0 ? '' : ',') + JSON.stringify(review))
        .join('');
      first = false;
      afterId = reviews[reviews.length - 1]?.id ?? null;
      if (reviews.length < EXPORT_REVIEW_BATCH_SIZE) {
        break;
      }
    }

    yield `],"billing":${JSON.stringify(sections.billing)}}`;
  }
}
