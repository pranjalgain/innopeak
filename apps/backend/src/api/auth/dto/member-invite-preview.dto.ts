import { ApiProperty } from '@nestjs/swagger';

/** `GET /v1/auth/invite/:token`'s response — lets the accept screen show "You've been invited as
 *  `<email>`" before asking for a name and password, without spending the token. */
export class MemberInvitePreviewDto {
  @ApiProperty({ example: 'sam.rivera@thecoffeehouse.com' })
  email!: string;

  static from(row: { email: string }): MemberInvitePreviewDto {
    const dto = new MemberInvitePreviewDto();
    dto.email = row.email;
    return dto;
  }
}
