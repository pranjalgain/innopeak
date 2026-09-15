import { BusinessStatus } from '@common/enums/business-status.enum';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class UpdateBusinessStatusDto {
  @ApiProperty({ example: BusinessStatus.SUSPENDED, enum: BusinessStatus })
  @IsEnum(BusinessStatus, { message: 'status must be either active or suspended' })
  status!: BusinessStatus;
}
