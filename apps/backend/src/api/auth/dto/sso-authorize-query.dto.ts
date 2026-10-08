import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { OAuthIntent } from '../enums/oauth-intent.enum';

/**
 * Deliberately a subset of `OAuthIntent`: `ADMIN_INVITE` is only minted by `GET
 * /v1/auth/invite/:token/google`, which supplies the `inviteToken` it needs. Accepting it here
 * would mint a tokenless state that can only dead-end.
 */
const AUTHORIZE_INTENTS = [OAuthIntent.LOGIN, OAuthIntent.SIGNUP] as const;

export class SsoAuthorizeQueryDto {
  @ApiProperty({
    example: OAuthIntent.SIGNUP,
    enum: AUTHORIZE_INTENTS,
    description:
      'Which button started this. `signup` may end in a new tenant; `login` never creates one ' +
      'and rejects an unknown identity with `?error=NO_ACCOUNT`. Neither carries a business ' +
      'name here — see `POST /v1/auth/sso/complete-signup`, which is where a genuinely new ' +
      'signup supplies one, after Google has already verified the identity. Accepting a ' +
      'platform-admin invite through Google is NOT one of these — that has its own route, ' +
      '`GET /v1/auth/invite/:token/google`, which carries the invite token.',
  })
  @IsIn(AUTHORIZE_INTENTS, {
    message: `intent must be one of: ${AUTHORIZE_INTENTS.join(', ')}`,
  })
  intent!: OAuthIntent;
}
