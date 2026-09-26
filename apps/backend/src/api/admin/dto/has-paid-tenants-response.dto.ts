import { ApiProperty } from '@nestjs/swagger';

export class HasPaidTenantsResponseDto {
  @ApiProperty({
    example: true,
    description:
      'True while at least one tenant is on the Paid plan — independent of ' +
      'PAYMENT_FEATURE_ENABLED, which never retroactively affects an already-Paid tenant.',
  })
  hasPaidTenants!: boolean;

  static from(hasPaidTenants: boolean): HasPaidTenantsResponseDto {
    const dto = new HasPaidTenantsResponseDto();
    dto.hasPaidTenants = hasPaidTenants;
    return dto;
  }
}
