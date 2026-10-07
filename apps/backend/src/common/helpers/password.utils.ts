import * as bcrypt from 'bcrypt';

import * as crypto from 'crypto';

const SALT_ROUNDS = 10;

/** Cryptographically secure. */
export function generateRandomPassword(length: number = 8): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  const charsetLength = charset.length;

  return crypto.randomBytes(length).reduce((acc, byte) => acc + charset[byte % charsetLength], '');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
