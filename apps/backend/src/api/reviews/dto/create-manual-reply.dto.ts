import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateManualReplyDto {
  @ApiProperty({
    description: 'The reply text to post, written from scratch rather than approving a draft.',
    example:
      "Marcus, I've read this and I'm sorry. I'm the owner — please email me at " +
      "hello@example.com and I'll sort this out personally.",
    maxLength: 4096,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  content!: string;
}
