import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { OAuthIntent } from '../enums/oauth-intent.enum';

export class GoogleAuthorizeQueryDto {
  @ApiProperty({
    example: OAuthIntent.SIGNUP,
    enum: OAuthIntent,
    description:
      'Which button started this. `signup` may end in a new tenant; `login` never creates one ' +
      'and rejects an unknown identity with `?error=NO_ACCOUNT`. Neither carries a business ' +
      'name here — see `POST /v1/auth/google/complete-signup`, which is where a genuinely new ' +
      'signup supplies one, after Google has already verified the identity.',
  })
  @IsEnum(OAuthIntent, {
    message: `intent must be one of: ${Object.values(OAuthIntent).join(', ')}`,
  })
  intent!: OAuthIntent;
}
