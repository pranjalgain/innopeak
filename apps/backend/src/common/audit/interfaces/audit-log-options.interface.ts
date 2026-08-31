export interface AuditLogOptions {
  requestedApi: string;
  operationType: 'DELETE' | 'INSERT' | 'UPDATE' | 'VIEW';
  severity: 'CRITICAL' | 'HIGH' | 'LOW' | 'MEDIUM';
  description: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}
