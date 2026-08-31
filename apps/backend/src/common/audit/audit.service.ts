import { AuditRepository } from '@db/repositories/common/audit.repository';
import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';

import { AuditLogOptions } from './interfaces/audit-log-options.interface';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  /**
   * Write an audit log record with the given options.
   */
  async log(options: AuditLogOptions): Promise<void> {
    try {
      await this.auditRepository.create({
        requestedApi: options.requestedApi,
        operationType: options.operationType,
        severity: options.severity,
        description: options.description,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      });
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${(error as Error).message}`);
    }
  }

  /**
   * Convenience method for logging user actions.
   * Extracts IP address and user agent from the request if provided.
   */
  async logUserAction(
    userId: string,
    action: string,
    description: string,
    request?: Request
  ): Promise<void> {
    try {
      await this.auditRepository.create({
        requestedApi: action,
        operationType: 'VIEW',
        severity: 'LOW',
        description,
        ipAddress: request?.ip ?? request?.socket.remoteAddress,
        userAgent: request?.headers['user-agent'],
        userId,
      });
    } catch (error) {
      this.logger.error(`Failed to write user audit log: ${(error as Error).message}`);
    }
  }
}
