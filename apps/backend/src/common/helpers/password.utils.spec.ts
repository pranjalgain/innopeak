import { comparePasswords, generateRandomPassword, hashPassword } from './password.utils';

describe('generateRandomPassword', () => {
  it('generates a password of the default length (8) when no length is given', () => {
    const password = generateRandomPassword();
    expect(password).toHaveLength(8);
  });

  it('generates a password of the requested length', () => {
    const password = generateRandomPassword(16);
    expect(password).toHaveLength(16);
  });

  it('generates an empty string for length 0', () => {
    const password = generateRandomPassword(0);
    expect(password).toBe('');
  });

  it('only uses characters from the expected charset', () => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    const password = generateRandomPassword(64);
    for (const ch of password) {
      expect(charset.includes(ch)).toBe(true);
    }
  });

  it('generates different passwords across calls (extremely unlikely to collide)', () => {
    const a = generateRandomPassword(32);
    const b = generateRandomPassword(32);
    expect(a).not.toBe(b);
  });
});

describe('hashPassword / comparePasswords', () => {
  it('hashes a password to a non-plaintext bcrypt hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('returns true when comparing the original password against its hash', async () => {
    const hash = await hashPassword('my-secret-password');
    await expect(comparePasswords('my-secret-password', hash)).resolves.toBe(true);
  });

  it('returns false when comparing a wrong password against a hash', async () => {
    const hash = await hashPassword('my-secret-password');
    await expect(comparePasswords('wrong-password', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password (random salt per call)', async () => {
    const [hash1, hash2] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(hash1).not.toBe(hash2);
  });
});
