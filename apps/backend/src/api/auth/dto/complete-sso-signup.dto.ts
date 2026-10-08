import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class CompleteSsoSignupDto {
  @ApiProperty({
    example: 'The Coastal Table',
    description:
      'An SSO provider returns a person, not a business, and `tenants.name` is NOT NULL — this is what ' +
      'the pending signup (the `sso_pending_signup` cookie set by the callback) has been ' +
      'waiting on. Always required: this endpoint only exists for the genuinely-new-signup case.',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 255)
  businessName!: string;
}
