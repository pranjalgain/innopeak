import { ApiProperty } from '@nestjs/swagger';

import type { BillingProfile } from '../types/billing.type';

export class BillingProfileResponseDto {
  @ApiProperty({ example: 'Jordan Lee', nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ example: 'jordan@example.com', nullable: true, type: String })
  email!: string | null;

  static from(profile: BillingProfile): BillingProfileResponseDto {
    const dto = new BillingProfileResponseDto();
    dto.name = profile.name;
    dto.email = profile.email;
    return dto;
  }
}
