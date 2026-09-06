import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

import { normalizeEmailInput } from '../utils/email.utils';

export class LoginDto {
  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  @Transform(({ value }: { value: unknown }) => normalizeEmailInput(value))
  @IsEmail({}, { message: 'email must be a valid email address' })
  email!: string;

  @ApiProperty({ example: 'StrongP@ss1' })
  @IsString({ message: 'password must be a string' })
  @IsNotEmpty({ message: 'password is required' })
  password!: string;
}
