import type { SignupTrendPoint } from '@db/repositories/admin-overview/types/admin-overview.type';
import { ApiProperty } from '@nestjs/swagger';

export class AdminSignupTrendPointResponseDto {
  @ApiProperty({ example: '2026-09', description: 'Calendar month, `YYYY-MM`, zero-padded.' })
  monthKey!: string;

  @ApiProperty({ example: 12, description: 'Tenants created that month. Zero if none were.' })
  count!: number;

  static from(point: SignupTrendPoint): AdminSignupTrendPointResponseDto {
    const dto = new AdminSignupTrendPointResponseDto();
    dto.monthKey = `${point.year}-${String(point.month).padStart(2, '0')}`;
    dto.count = point.count;
    return dto;
  }
}
