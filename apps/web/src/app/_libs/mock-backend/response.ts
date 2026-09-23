import type { InternalAxiosRequestConfig } from "axios";

/** Mirrors the backend's `ApiResponse` envelope (`apps/backend/src/common/dto/api-response.ts`) —
 *  every real response is wrapped in this, and `unwrap()` on the frontend expects it. */
export interface MockEnvelope<T> {
  statusCode: number;
  status: "success" | "error";
  message?: string;
  error?: string;
  traceId: string;
  data?: T;
}

export interface MockAxiosResponse<T = unknown> {
  data: MockEnvelope<T>;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: InternalAxiosRequestConfig;
}

let traceCounter = 0;
function nextTraceId(): string {
  traceCounter += 1;
  return `mock-trace-${String(traceCounter)}`;
}

/** A resolved 2xx result — what a route handler returns on success. */
export function success<T>(data: T, message = "OK", statusCode = 200): MockEnvelope<T> {
  return { statusCode, status: "success", message, data, traceId: nextTraceId() };
}

/**
 * A rejected non-2xx result. Thrown, not returned — `adapter.ts` catches it and re-throws in the
 * exact shape axios's own response interceptor (`api-sdk/config.ts`) already knows how to read:
 * `error.response.status` / `error.response.data.message` / `error.response.data.error`.
 */
export class MockApiFailure extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.status = status;
    if (errorCode !== undefined) this.errorCode = errorCode;
  }
}

export function failure(status: number, message: string, errorCode?: string): never {
  throw new MockApiFailure(status, message, errorCode);
}
