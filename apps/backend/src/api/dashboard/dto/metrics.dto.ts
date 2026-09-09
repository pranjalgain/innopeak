import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MetricsDto {
  @ApiProperty({
    example: 128,
    description: 'Reviews whose `reviewed_at` falls inside the requested window.',
  })
  total!: number;

  @ApiPropertyOptional({
    example: 4.3,
    nullable: true,
    description: 'Mean rating across the window, or null when it contains no reviews.',
  })
  avgRating!: number | null;

  @ApiProperty({
    example: 6,
    description:
      'Open queue backlog (status `new` or `in_review`). Deliberately NOT windowed: the card ' +
      'reads "Pending approval", so it has to count everything still awaiting action, not just ' +
      'what arrived in the last `days`.',
  })
  pending!: number;

  @ApiProperty({
    example: 2,
    description:
      'Escalated reviews still open — classification `escalated` AND status `new`/`in_review`. ' +
      'Not windowed, same reasoning as `pending`. The status filter is what lets this fall back ' +
      'to zero as the queue is worked; counting every escalation ever would only ever grow.',
  })
  escalated!: number;
}
