import type { ApiResponse } from '@common/dto/api-response';

export class ResponseUtil {
  static success<T>(
    data: T,
    message: string = 'Success',
    statusCode: number = 200
  ): ApiResponse<T> {
    return { status: 'Success', data, message, statusCode };
  }

  static error<T>(message: string = 'Error', statusCode: number = 500, data: T): ApiResponse<T> {
    return { status: 'Failure', data, message, statusCode };
  }
}
