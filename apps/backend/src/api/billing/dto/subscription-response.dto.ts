import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { SubscriptionStatus } from '@common/enums/subscription-status.enum';
import type { TenantSubscriptionRow } from '@db/repositories/billing/types/billing.type';
import { ApiProperty } from '@nestjs/swagger';

import type { PaymentMethodSummary } from '../types/billing.type';

/** Card metadata only, safe to render unmasked-adjacent (`•••• 4242`) — never the PAN, so this
 *  carries no PCI scope. See `PaymentProvider.getPaymentMethodSummary`'s own doc comment. */
export class PaymentMethodResponseDto {
  @ApiProperty({ example: 'visa' })
  brand!: string;

  @ApiProperty({ example: '4242' })
  last4!: string;

  @ApiProperty({ example: 12 })
  expMonth!: number;

  @ApiProperty({ example: 2034 })
  expYear!: number;

  static from(summary: PaymentMethodSummary): PaymentMethodResponseDto {
    const dto = new PaymentMethodResponseDto();
    dto.brand = summary.brand;
    dto.last4 = summary.last4;
    dto.expMonth = summary.expMonth;
    dto.expYear = summary.expYear;
    return dto;
  }
}

export class SubscriptionResponseDto {
  @ApiProperty({ example: 'paid', enum: BillingPlanCode })
  planCode!: BillingPlanCode;

  @ApiProperty({ example: 'active', enum: SubscriptionStatus, nullable: true, type: String })
  status!: SubscriptionStatus | null;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z', nullable: true, type: String })
  currentPeriodStart!: string | null;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', nullable: true, type: String })
  currentPeriodEnd!: string | null;

  @ApiProperty({
    example: false,
    description:
      'true while a canceled subscription is still inside its paid grace period — planCode stays ' +
      "'paid' with unlimited entitlements until the period actually ends.",
  })
  cancelAtPeriodEnd!: boolean;

  @ApiProperty({ example: 1 })
  activeLocationCount!: number;

  @ApiProperty({ example: 1, nullable: true, type: Number, description: 'null = unlimited' })
  maxLocations!: number | null;

  @ApiProperty({ example: 1 })
  teamMemberCount!: number;

  @ApiProperty({ example: 1, nullable: true, type: Number, description: 'null = unlimited' })
  maxTeamMembers!: number | null;

  @ApiProperty({ example: 0 })
  aiDraftsUsedThisMonth!: number;

  @ApiProperty({ example: 20, nullable: true, type: Number, description: 'null = unlimited' })
  maxAiDraftsPerMonth!: number | null;

  @ApiProperty({ example: false })
  customPromptsEnabled!: boolean;

  @ApiProperty({
    type: PaymentMethodResponseDto,
    nullable: true,
    description: 'null when there is no Stripe customer yet, or no card on file.',
  })
  paymentMethod!: PaymentMethodResponseDto | null;

  static from(
    subscription: TenantSubscriptionRow,
    planCode: BillingPlanCode,
    entitlements: {
      maxLocations: number | null;
      maxAiDraftsPerMonth: number | null;
      maxTeamMembers: number | null;
      customPromptsEnabled: boolean;
      activeLocationCount: number;
      teamMemberCount: number;
      aiDraftsUsedThisMonth: number;
    },
    paymentMethod: PaymentMethodSummary | null
  ): SubscriptionResponseDto {
    const dto = new SubscriptionResponseDto();
    dto.planCode = planCode;
    dto.status = subscription.status;
    dto.currentPeriodStart = subscription.currentPeriodStart;
    dto.currentPeriodEnd = subscription.currentPeriodEnd;
    dto.cancelAtPeriodEnd = subscription.cancelAtPeriodEnd;
    dto.activeLocationCount = entitlements.activeLocationCount;
    dto.maxLocations = entitlements.maxLocations;
    dto.teamMemberCount = entitlements.teamMemberCount;
    dto.maxTeamMembers = entitlements.maxTeamMembers;
    dto.aiDraftsUsedThisMonth = entitlements.aiDraftsUsedThisMonth;
    dto.maxAiDraftsPerMonth = entitlements.maxAiDraftsPerMonth;
    dto.customPromptsEnabled = entitlements.customPromptsEnabled;
    dto.paymentMethod = paymentMethod ? PaymentMethodResponseDto.from(paymentMethod) : null;
    return dto;
  }
}
