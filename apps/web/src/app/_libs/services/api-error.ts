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
 * Every generated SDK method's declared return type is the *inner* DTO (e.g. `TokenResponseDto`),
 * but the backend actually wraps every response in `ApiEnvelope` — the generator has no way to know
 * that from the OpenAPI schema, so at runtime `axios`'s own `response.data` is really the envelope,
 * one level up from what the type says. This unwraps it, matching how the old hand-written
 * `ApiClient.request` used to parse `envelope.data` itself.
 */
export function unwrap<T>(envelopeData: unknown): T {
  return (envelopeData as ApiEnvelope<T>).data as T;
}
