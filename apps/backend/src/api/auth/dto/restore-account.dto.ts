import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

import { normalizeEmailInput } from '../utils/email.utils';

export class RestoreAccountDto {
  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  @Transform(({ value }: { value: unknown }) => normalizeEmailInput(value))
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @ApiProperty({ example: 'StrongP@ss1' })
  @IsString({ message: 'Enter your password.' })
  @IsNotEmpty({ message: 'Enter your password.' })
  password!: string;
}
