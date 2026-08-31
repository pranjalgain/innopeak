import { UnauthorizedException } from '@nestjs/common';

export class CustomUnauthorizedException extends UnauthorizedException {
  constructor(
    public readonly errorCode: string,
    message?: string,
    error?: string
  ) {
    super({
      status: 'Failure',
      message: message ?? 'Unauthorized',
      error: error ?? 'Unauthorized',
      errorCode,
    });
  }
}
