import { ApiProperty } from '@nestjs/swagger';

export class RatingDistributionDto {
  @ApiProperty({
    description:
      'Review counts keyed by rating. Keys 1-5 are always present and zero-filled, so the client ' +
      'can render five bars without probing for absent buckets.',
    example: { '1': 3, '2': 1, '3': 4, '4': 20, '5': 96 },
    additionalProperties: { type: 'integer' },
  })
  distribution!: Record<number, number>;
}
