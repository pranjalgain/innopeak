import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

import { trimStringInput } from '../../auth/utils/string.utils';

export class CreateBlocklistTermDto {
  @ApiProperty({
    example: 'food poisoning',
    minLength: 1,
    maxLength: 255,
    description:
      'Stored with the casing sent; matched case-insensitively. Multi-word phrases are valid.',
  })
  @Transform(({ value }: { value: unknown }) => trimStringInput(value))
  @IsString({ message: 'term must be a string' })
  @Length(1, 255, { message: 'term must be between 1 and 255 characters' })
  term!: string;
}
