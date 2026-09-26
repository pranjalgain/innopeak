import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import type { BillingPlanRow } from '@db/repositories/billing/billing-plans.repository';
import { ApiProperty } from '@nestjs/swagger';

export class BillingPlanDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011' })
  id!: string;

  @ApiProperty({ example: 'paid', enum: BillingPlanCode })
  code!: BillingPlanCode;

  @ApiProperty({ example: 1, nullable: true, type: Number, description: 'null = unlimited' })
  maxLocations!: number | null;

  @ApiProperty({ example: 20, nullable: true, type: Number, description: 'null = unlimited' })
  maxAiDraftsPerMonth!: number | null;

  @ApiProperty({ example: 1, nullable: true, type: Number, description: 'null = unlimited' })
  maxTeamMembers!: number | null;

  @ApiProperty({ example: false })
  customPromptsEnabled!: boolean;

  static from(plan: BillingPlanRow): BillingPlanDto {
    const dto = new BillingPlanDto();
    dto.id = plan.id;
    dto.code = plan.code;
    dto.maxLocations = plan.maxLocations;
    dto.maxAiDraftsPerMonth = plan.maxAiDraftsPerMonth;
    dto.maxTeamMembers = plan.maxTeamMembers;
    dto.customPromptsEnabled = plan.customPromptsEnabled;
    return dto;
  }
}

export class BillingPlansResponseDto {
  @ApiProperty({ type: [BillingPlanDto] })
  plans!: BillingPlanDto[];

  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011' })
  currentPlanId!: string;

  static from(plans: BillingPlanRow[], currentPlanId: string): BillingPlansResponseDto {
    const dto = new BillingPlansResponseDto();
    dto.plans = plans.map(plan => BillingPlanDto.from(plan));
    dto.currentPlanId = currentPlanId;
    return dto;
  }
}
