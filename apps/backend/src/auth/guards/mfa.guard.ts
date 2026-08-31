import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * Extended user interface for MFA-aware requests.
 * The JWT strategy should populate these fields when decoding the token.
 */
interface MfaAwareUser extends AuthUser {
  mfaEnabled?: boolean;
  mfaVerified?: boolean;
}

/**
 * Guard that checks if a user with MFA enabled has completed MFA verification
 * for the current session. If MFA is not enabled for the user, the guard passes.
 *
 * This guard should be applied after JwtAuthGuard in the guard chain so that
 * request.user is already populated.
 */
@Injectable()
export class MfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as MfaAwareUser | undefined;

    // If no user on request (unauthenticated route), let other guards handle it
    if (!user) {
      return true;
    }

    // If MFA is not enabled for this user, allow access
    if (!user.mfaEnabled) {
      return true;
    }

    // MFA is enabled but session is not MFA-verified
    if (!user.mfaVerified) {
      throw new ForbiddenException(
        'MFA verification required. Please complete multi-factor authentication.'
      );
    }

    return true;
  }
}
