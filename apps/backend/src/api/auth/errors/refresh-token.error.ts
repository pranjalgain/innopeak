import { MESSAGES } from '@common/constants/messages.constants';
import { UnauthorizedException } from '@nestjs/common';

/**
 * A refresh token that lost a concurrent rotation race while its session is still alive. Carries the
 * same 401 message as a plain UnauthorizedException; the subclass lets AuthController.refresh skip
 * clearing cookies, since the winning tab already holds a valid successor.
 */
export class RefreshTokenSupersededException extends UnauthorizedException {
  constructor() {
    super(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
  }
}
