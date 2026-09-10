import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecentEscalatedDto {
  @ApiProperty({ example: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22' })
  id!: string;

  @ApiPropertyOptional({ example: 'Marta Kowalska', type: String, nullable: true })
  reviewerName!: string | null;

  @ApiProperty({ example: 2 })
  rating!: number;

  @ApiPropertyOptional({
    example: 'Waited forty minutes past our booking.',
    type: String,
    nullable: true,
  })
  reviewText!: string | null;

  @ApiPropertyOptional({
    example: EscalationReason.LOW_RATING,
    enum: EscalationReason,
    nullable: true,
    description:
      'Why the classifier escalated this review. Returned rather than left to the client to ' +
      'infer: the two reasons are independent of the star rating, so a 5-star blocklist match ' +
      'and a 1-star rating escalation are both routine.',
  })
  escalationReason!: EscalationReason | null;

  @ApiPropertyOptional({
    example: '2026-03-11T18:22:04.129Z',
    type: String,
    nullable: true,
    description: 'When the reviewer left the review, not when the row was imported.',
  })
  reviewedAt!: string | null;
}
