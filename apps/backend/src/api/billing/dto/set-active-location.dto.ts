import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetActiveLocationDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0033' })
  @IsUUID()
  locationId!: string;
}
