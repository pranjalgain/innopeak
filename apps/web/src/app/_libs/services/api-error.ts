/** Mirrors the backend's ApiResponse envelope (apps/backend/src/common/dto/api-response.ts). */
export interface ApiEnvelope<T> {
  statusCode?: number;
  status: string;
  message?: string;
  error?: string;
  traceId?: string;
  data?: T;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode?: string;

  constructor(statusCode: number, message: string, errorCode?: string) {
    super(message);
    this.statusCode = statusCode;
    if (errorCode !== undefined) this.errorCode = errorCode;
  }
}

/**
 * The SDK declares the inner DTO as the return type, but the backend wraps every response in `ApiEnvelope`
 * (invisible to the OpenAPI schema), so `response.data` is really the envelope; this unwraps it.
 */
export function unwrap<T>(envelopeData: unknown): T {
  return (envelopeData as ApiEnvelope<T>).data as T;
}
