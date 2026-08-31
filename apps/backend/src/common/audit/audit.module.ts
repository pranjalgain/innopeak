import { Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * AuditModule provides application-level audit logging.
 *
 * AuditRepository is registered in the global DBModule, so it is
 * already available for injection. This module only needs to
 * register and export AuditService.
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
