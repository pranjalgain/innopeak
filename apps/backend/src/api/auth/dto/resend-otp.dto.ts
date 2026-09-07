import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

import { normalizeEmailInput } from '../utils/email.utils';

export class ResendOtpDto {
  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  @Transform(({ value }: { value: unknown }) => normalizeEmailInput(value))
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;
}
