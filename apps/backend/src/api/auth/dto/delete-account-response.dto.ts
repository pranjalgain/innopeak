import { ApiProperty } from '@nestjs/swagger';

export class DeleteAccountResponseDto {
  @ApiProperty({
    example: '2026-10-27T09:30:00.000Z',
    description: 'When the business and its data are permanently erased unless restored first.',
  })
  scheduledFor!: string;

  @ApiProperty({ example: 21, description: 'The grace period the deadline was computed from.' })
  gracePeriodDays!: number;

  @ApiProperty({
    example: true,
    description:
      'Whether the owner can restore it themselves (they have a password to sign in with). When ' +
      'false, restoring means contacting support.',
  })
  canRestore!: boolean;
}
