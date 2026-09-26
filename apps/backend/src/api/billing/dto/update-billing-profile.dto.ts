import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateBillingProfileDto {
  @ApiProperty({ example: 'Jordan Lee' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'jordan@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255)
  email!: string;
}
