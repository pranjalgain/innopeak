import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateNotificationRecipientDto } from './update-notification-recipient.dto';

const OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

describe('UpdateNotificationRecipientDto.isActive', () => {
  // The global pipe converts "false" to `true` before validation, so a client sending the string turned a recipient ON.
  it.each([
    ['false', false],
    ['true', true],
    [false, false],
    [true, true],
  ])('reads %j as %j', async (input, expected) => {
    const dto = plainToInstance(UpdateNotificationRecipientDto, { isActive: input });

    expect(await validate(dto, OPTIONS)).toEqual([]);
    expect(dto.isActive).toBe(expected);
  });

  it('refuses anything that is not a boolean', async () => {
    const dto = plainToInstance(UpdateNotificationRecipientDto, { isActive: 'maybe' });

    expect((await validate(dto, OPTIONS)).map(e => e.property)).toContain('isActive');
  });
});
