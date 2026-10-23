import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AcceptAdminInviteDto } from './accept-admin-invite.dto';
import { AcceptMemberInviteDto } from './accept-member-invite.dto';
import { ChangePasswordDto } from './change-password.dto';
import { LoginDto } from './login.dto';
import { RestoreAccountDto } from './restore-account.dto';
import { SetPasswordDto } from './set-password.dto';
import { SignupDto } from './signup.dto';

import { ChangeAdminPasswordDto } from '../../admin/dto/change-admin-password.dto';
import { SetAdminPasswordDto } from '../../admin/dto/set-admin-password.dto';

/** Meets the complexity rule at any length: upper, lower, digit and a special character, padded with lower-case letters. */
const strong = (length: number): string => `Aa1!${'x'.repeat(Math.max(0, length - 4))}`;

async function errorsFor(
  type: new () => object,
  field: string,
  value: string,
  rest: Record<string, unknown> = {}
): Promise<string[]> {
  const instance = plainToInstance(type, { ...rest, [field]: value });
  const errors = await validate(instance);
  return errors
    .filter(error => error.property === field)
    .flatMap(error => Object.keys(error.constraints ?? {}));
}

describe('password length limits', () => {
  // bcrypt reads only the first 72 bytes and ignores the rest, so a longer new password would be silently truncated.
  describe('a new password is capped at the 72 bytes bcrypt actually uses', () => {
    const base = {
      email: 'jane@thecoffeehouse.com',
      businessName: 'Coffee House',
      ownerName: 'Jane',
    };
    const cases: Array<[string, new () => object, string, Record<string, unknown>]> = [
      ['sign-up', SignupDto, 'password', base],
      ['change password', ChangePasswordDto, 'newPassword', { currentPassword: 'Old1!pass' }],
      ['set password', SetPasswordDto, 'newPassword', { otp: '123456' }],
      ['accept a member invite', AcceptMemberInviteDto, 'password', { token: 't', name: 'Jane' }],
      ['accept an admin invite', AcceptAdminInviteDto, 'password', { token: 't' }],
      [
        'change an admin password',
        ChangeAdminPasswordDto,
        'newPassword',
        { currentPassword: 'Old1!pass' },
      ],
      ['set an admin password', SetAdminPasswordDto, 'newPassword', { otp: '123456' }],
    ];

    it.each(cases)('%s accepts 72 bytes and refuses 73', async (_label, type, field, rest) => {
      await expect(errorsFor(type, field, strong(72), rest)).resolves.not.toContain(
        'maxByteLength'
      );
      await expect(errorsFor(type, field, strong(73), rest)).resolves.toContain('maxByteLength');
    });

    it('counts bytes: 40 accented characters are 80 bytes', async () => {
      const accented = `Aa1!${'ä'.repeat(36)}`;

      expect(Buffer.byteLength(accented)).toBeGreaterThan(72);
      await expect(errorsFor(SignupDto, 'password', accented, base)).resolves.toContain(
        'maxByteLength'
      );
    });
  });

  // An older password up to 128 characters still has to sign in: it was truncated the same way when it was set.
  describe('a password being checked is capped at 128 characters, not at 72', () => {
    it.each([
      ['login', LoginDto, { email: 'jane@thecoffeehouse.com' }],
      ['restore account', RestoreAccountDto, { email: 'jane@thecoffeehouse.com' }],
    ] as const)('%s accepts 128 and refuses 129', async (_label, type, rest) => {
      await expect(errorsFor(type, 'password', 'a'.repeat(128), rest)).resolves.toEqual([]);
      await expect(errorsFor(type, 'password', 'a'.repeat(129), rest)).resolves.toContain(
        'maxLength'
      );
    });
  });
});
