import { ApiProperty } from '@nestjs/swagger';

/** `GET /v1/auth/invite/:token`'s response — lets the accept screen show "You've been invited as
 *  `<email>`" before asking for a password, without spending the token. */
export class AdminInvitePreviewDto {
  @ApiProperty({ example: 'priya.ops@innopeak.com' })
  email!: string;

  static from(row: { email: string }): AdminInvitePreviewDto {
    const dto = new AdminInvitePreviewDto();
    dto.email = row.email;
    return dto;
  }
}
