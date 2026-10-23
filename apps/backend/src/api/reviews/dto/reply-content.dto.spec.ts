import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ApproveReplyDto } from './approve-reply.dto';
import { CreateManualReplyDto } from './create-manual-reply.dto';

const OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;
const BLANKS = [
  '   ',
  '\n\t ',
  String.fromCharCode(0x200b),
  String.fromCharCode(0xfeff, 0x20, 0x2060),
  // Invisible characters the first version of the check let through:
  String.fromCharCode(0x00ad), // soft hyphen
  String.fromCharCode(0x200e, 0x200f), // directional marks
  String.fromCharCode(0x3164, 0xffa0), // Hangul fillers
  String.fromCharCode(0x2800), // braille blank
];

describe('reply content must contain visible text', () => {
  it.each(BLANKS)('approve rejects blank content %j', async content => {
    const errors = await validate(plainToInstance(ApproveReplyDto, { content }), OPTIONS);
    expect(errors.map(e => e.property)).toContain('content');
  });

  it.each(BLANKS)('manual reply rejects blank content %j', async content => {
    const errors = await validate(plainToInstance(CreateManualReplyDto, { content }), OPTIONS);
    expect(errors.map(e => e.property)).toContain('content');
  });

  it('still accepts a normal reply, and an omitted approve body', async () => {
    expect(
      await validate(plainToInstance(CreateManualReplyDto, { content: 'Thank you!' }), OPTIONS)
    ).toEqual([]);
    expect(await validate(plainToInstance(ApproveReplyDto, {}), OPTIONS)).toEqual([]);
  });
});

describe('blocklist term must contain visible text', () => {
  it('rejects a zero-width-only term', async () => {
    const { CreateBlocklistTermDto } = await import('../../settings/dto/create-blocklist-term.dto');
    const errors = await validate(
      plainToInstance(CreateBlocklistTermDto, { term: String.fromCharCode(0x200b) }),
      OPTIONS
    );
    expect(errors.map(e => e.property)).toContain('term');
  });
});

// Google's reply limit is 4096; a longer text used to pass approval and fail only when it was posted.
describe('reply length matches Google’s limit', () => {
  const lengthErrors = async (
    Dto: typeof ApproveReplyDto | typeof CreateManualReplyDto,
    length: number
  ): Promise<string[]> =>
    (await validate(plainToInstance(Dto, { content: 'a'.repeat(length) }), OPTIONS)).map(
      e => e.property
    );

  it.each([ApproveReplyDto, CreateManualReplyDto])(
    '%p accepts 4096 characters and refuses 4097',
    async Dto => {
      expect(await lengthErrors(Dto, 4096)).toEqual([]);
      expect(await lengthErrors(Dto, 4097)).toContain('content');
    }
  );
});
