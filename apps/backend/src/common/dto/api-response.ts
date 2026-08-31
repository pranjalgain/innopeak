export class ApiResponse<T> {
  statusCode?: number;
  status!: string;
  message?: string;
  error?: string;
  traceId?: string;
  data?: T;
  meta?: Record<string, unknown>;
}
