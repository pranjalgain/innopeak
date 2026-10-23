import { SignupBindingService } from './signup-binding.service';

describe('SignupBindingService', () => {
  const build = (secret: string | undefined): SignupBindingService =>
    new SignupBindingService({ get: () => secret } as never);

  const target = build('j'.repeat(40));
  const user = { id: 'user-1', passwordHash: 'hash-chosen-at-signup' };

  it('refuses to start without a secret to derive its key from', () => {
    expect(() => build(undefined)).toThrow('JWT_SECRET');
    expect(() => build('')).toThrow('JWT_SECRET');
  });

  it('accepts the value it issued for that user and password', () => {
    expect(target.matches(user, target.issue(user))).toBe(true);
  });

  it('is deterministic, so no state is kept between sign-up and verification', () => {
    expect(build('j'.repeat(40)).matches(user, target.issue(user))).toBe(true);
  });

  // The whole point: the mailbox owner holds the emailed code but not the stranger's password, so they cannot produce this.
  it('does not match a different password, which is what a stranger-created account has to the mailbox owner', () => {
    const issued = target.issue(user);

    expect(target.matches({ ...user, passwordHash: 'hash-the-owner-set-later' }, issued)).toBe(
      false
    );
  });

  it('does not match another user, or one signed with another secret', () => {
    const issued = target.issue(user);

    expect(target.matches({ ...user, id: 'user-2' }, issued)).toBe(false);
    expect(build('k'.repeat(40)).matches(user, issued)).toBe(false);
  });

  it.each([undefined, '', 'forged', 'x'.repeat(200)])(
    'refuses a missing or malformed value (%p)',
    presented => {
      expect(target.matches(user, presented)).toBe(false);
    }
  );

  it('refuses an account with no password at all, which has nothing to prove knowledge of', () => {
    expect(target.matches({ id: 'user-1', passwordHash: null }, target.issue(user))).toBe(false);
  });

  it('does not reveal its key: the value is not the password hash or the user id', () => {
    const issued = target.issue(user);

    expect(issued).not.toContain(user.passwordHash);
    expect(issued).not.toContain(user.id);
  });
});
