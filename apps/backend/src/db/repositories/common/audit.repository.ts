import { DBService } from '@db/db.service';
import { auditLogs } from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { count, desc, eq } from 'drizzle-orm';

/** Shape of data required to create a new audit log record. */
interface CreateAuditLogData {
  requestedApi: string;
  operationType: 'DELETE' | 'INSERT' | 'UPDATE' | 'VIEW';
  severity: 'CRITICAL' | 'HIGH' | 'LOW' | 'MEDIUM';
  description: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  userId?: string | undefined;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly dbService: DBService) {}

  /**
   * Insert a new audit log record.
   * Since there is no userId column, the userId (if provided) is stored
   * in the hostName field for traceability.
   */
  async create(data: CreateAuditLogData): Promise<void> {
    await this.dbService.db.insert(auditLogs).values({
      requestedApi: data.requestedApi,
      operationType: data.operationType,
      severity: data.severity,
      description: data.userId ? `[userId=${data.userId}] ${data.description}` : data.description,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      hostName: data.userId ?? null,
    });
  }

  /**
   * Find audit log records filtered by requestedApi with pagination.
   * Returns the paginated rows and total count.
   */
  async findByApi(
    requestedApi: string,
    page: number,
    pageSize: number
  ): Promise<{
    data: (typeof auditLogs.$inferSelect)[];
    total: number;
  }> {
    const offset = (page - 1) * pageSize;

    const [totalResult, rows] = await Promise.all([
      this.dbService.db
        .select({ count: count() })
        .from(auditLogs)
        .where(eq(auditLogs.requestedApi, requestedApi)),
      this.dbService.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.requestedApi, requestedApi))
        .orderBy(desc(auditLogs.eventTimestamp))
        .limit(pageSize)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;

    return { data: rows, total };
  }
}
