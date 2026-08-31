import { type CustomDecorator, SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'audit_log';

export interface AuditLogDecoratorOptions {
  operationType: 'DELETE' | 'INSERT' | 'UPDATE' | 'VIEW';
  severity: 'CRITICAL' | 'HIGH' | 'LOW' | 'MEDIUM';
  description: string;
}

/**
 * Marks a route handler for automatic audit logging.
 * The AuditInterceptor reads this metadata and writes an audit record
 * after the response completes successfully.
 *
 * @example
 * @AuditLog({ operationType: 'INSERT', severity: 'MEDIUM', description: 'Created a new user' })
 */
export const AuditLog = (options: AuditLogDecoratorOptions): CustomDecorator =>
  SetMetadata(AUDIT_LOG_KEY, options);
