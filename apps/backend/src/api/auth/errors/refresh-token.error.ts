import { MESSAGES } from '@common/constants/messages.constants';
import { UnauthorizedException } from '@nestjs/common';

/**
 * A refresh token that is no longer active *but whose session is still alive* — it lost a
 * concurrent rotation race, or is a replay of a token another request already spent.
 *
 * Extends `UnauthorizedException` and carries the identical message, so the HTTP contract is
 * unchanged: the caller still gets a 401 with `INVALID_REFRESH_TOKEN` and learns nothing about
 * which case it hit (the enumeration property the auth messages deliberately preserve).
 *
 * The distinction exists purely for the cookie layer. `AuthController.refresh` clears all three
 * session cookies on a failed rotation, so that the frontend's `session` routing hint can't
 * outlive a dead session and bounce the user between `/login` and `/dashboard` forever. But when
 * two tabs refresh at once, the loser must NOT clear: the winner has already issued a valid
 * successor and the browser is holding it, so clearing would throw away a live session and log
 * the user out of every tab. `TokenService.rotate` throws this subclass in exactly that case, and
 * a plain `UnauthorizedException` when the family is genuinely gone.
 */
export class RefreshTokenSupersededException extends UnauthorizedException {
  constructor() {
    super(MESSAGES.AUTH.INVALID_REFRESH_TOKEN);
  }
}
